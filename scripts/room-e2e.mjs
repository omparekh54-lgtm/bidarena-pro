import assert from "node:assert/strict";

const origin = process.env.BIDARENA_E2E_ORIGIN ?? "http://127.0.0.1:3000";

async function request(path, init = {}, session) {
  const response = await fetch(`${origin}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(session ? { "x-bidarena-player": session.playerId, "x-bidarena-token": session.token } : {}),
    },
  });
  const body = await response.json();
  assert.equal(response.ok, true, `${path} failed (${response.status}): ${JSON.stringify(body)}`);
  return body;
}

function post(path, body, session) {
  return request(path, { method: "POST", ...(body ? { body: JSON.stringify(body) } : {}) }, session);
}

const created = await post("/api/rooms", { teamName: "Admin Athletic" });
assert.match(created.session.roomCode, /^\d{4}$/);
assert.equal(created.room.isAdmin, true);

const code = created.session.roomCode;
const joined = await post(`/api/rooms/${code}/join`, { teamName: "Challenger City" });
assert.equal(joined.room.participants.length, 2);
assert.equal(joined.room.isAdmin, false);

await post(`/api/rooms/${code}/configure`, { sport: "football", purse: 500, playerPoolMode: "mixed" }, created.session);
const started = await post(`/api/rooms/${code}/start`, undefined, created.session);
assert.equal(started.room.phase, "reveal");
assert.equal(started.room.queueLength, 600);
assert.equal(started.room.playerPoolMode, "mixed");
assert.equal(started.room.participants.every((team) => team.budget === 500), true);

await new Promise((resolve) => setTimeout(resolve, 3_350));
const [adminView, challengerView] = await Promise.all([
  request(`/api/rooms/${code}`, {}, created.session),
  request(`/api/rooms/${code}`, {}, joined.session),
]);
assert.equal(adminView.room.phase, "bidding");
assert.equal(challengerView.room.currentAthlete.id, adminView.room.currentAthlete.id);
assert.equal(challengerView.room.deadlineAt, adminView.room.deadlineAt);

const paused = await post(`/api/rooms/${code}/pause`, undefined, created.session);
assert.equal(paused.room.phase, "bidding");
assert.ok(paused.room.pausedAt);
const pausedDeadline = paused.room.deadlineAt;
await new Promise((resolve) => setTimeout(resolve, 500));
const pausedView = await request(`/api/rooms/${code}`, {}, joined.session);
assert.equal(pausedView.room.phase, "bidding");
assert.equal(pausedView.room.deadlineAt, pausedDeadline);
const resumed = await post(`/api/rooms/${code}/resume`, undefined, created.session);
assert.equal(resumed.room.pausedAt, null);
assert.ok(Date.parse(resumed.room.deadlineAt) > Date.parse(pausedDeadline));

const adminBid = await post(`/api/rooms/${code}/bid`, undefined, created.session);
const firstDeadline = Date.parse(adminBid.room.deadlineAt);
await new Promise((resolve) => setTimeout(resolve, 1_000));
const challengerBid = await post(`/api/rooms/${code}/bid`, undefined, joined.session);
const resetDeadline = Date.parse(challengerBid.room.deadlineAt);
const resetWindow = resetDeadline - Date.now();
assert.ok(resetDeadline > firstDeadline, "the second bid must reset the full ten-second deadline");
assert.ok(resetWindow >= 9_500 && resetWindow <= 10_100, `expected a full ten-second reset, received ${resetWindow}ms`);
assert.equal(challengerBid.room.leaderId, joined.session.playerId);

await new Promise((resolve) => setTimeout(resolve, Math.max(0, resetDeadline - Date.now() + 180)));
const settled = await request(`/api/rooms/${code}`, {}, created.session);
const winningTeam = settled.room.participants.find((participant) => participant.id === joined.session.playerId);
assert.equal(settled.room.phase, "sold");
assert.equal(settled.room.sales.length, 1);
assert.equal(winningTeam.squad.length, 0, "another team's squad stays private outside the transfer window");

const transferWindow = await post(`/api/rooms/${code}/transfer-window/open`, { durationSeconds: 30 }, created.session);
assert.equal(transferWindow.room.transferWindow.status, "open");
assert.ok(transferWindow.room.pausedAt);
assert.equal(transferWindow.room.participants.find((team) => team.id === joined.session.playerId).squad.length, 1, "all squads are visible while trading");
const athleteId = settled.room.currentAthlete.id;
const offered = await post(`/api/rooms/${code}/transfer-window/offers`, {
  type: "buy",
  toParticipantId: joined.session.playerId,
  offeredAthleteIds: [],
  requestedAthleteIds: [athleteId],
  cashAdjustment: 50,
}, created.session);
const offerId = offered.room.transferWindow.offers[0].id;
const accepted = await post(`/api/rooms/${code}/transfer-window/offers/${offerId}/respond`, { decision: "accept" }, joined.session);
assert.equal(accepted.room.transferWindow.offers[0].status, "accepted");
assert.equal(accepted.room.participants.find((team) => team.id === joined.session.playerId).squad.length, 0);
const closed = await post(`/api/rooms/${code}/transfer-window/close`, undefined, created.session);
assert.equal(closed.room.transferWindow.status, "closed");
assert.equal(closed.room.pausedAt, null);

const stopped = await post(`/api/rooms/${code}/stop`, undefined, created.session);
assert.equal(stopped.room.phase, "complete");
assert.ok(stopped.room.stoppedAt);
const finalResult = await request(`/api/rooms/${code}/result`);
const adminResult = finalResult.result.participants.find((participant) => participant.participantId === created.session.playerId);
assert.equal(adminResult.squad[0].athleteId, athleteId);
assert.equal(adminResult.finalBudget, 450);

console.log(JSON.stringify({
  roomCode: code,
  teams: settled.room.participants.map((participant) => participant.teamName),
  athlete: settled.room.currentAthlete.name,
  winningTeam: winningTeam.teamName,
  acceptedBid: settled.room.currentBid,
  timerResetWindowMilliseconds: resetWindow,
  administratorControls: "pause/resume/transfer/stop verified",
  durableResult: "verified",
  result: "PASS",
}, null, 2));
