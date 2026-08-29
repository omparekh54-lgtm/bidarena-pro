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

await post(`/api/rooms/${code}/configure`, { sport: "football", purse: 500 }, created.session);
const started = await post(`/api/rooms/${code}/start`, undefined, created.session);
assert.equal(started.room.phase, "reveal");
assert.equal(started.room.queueLength, 20);
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
assert.equal(winningTeam.squad.length, 1);

const stopped = await post(`/api/rooms/${code}/stop`, undefined, created.session);
assert.equal(stopped.room.phase, "complete");
assert.ok(stopped.room.stoppedAt);

console.log(JSON.stringify({
  roomCode: code,
  teams: settled.room.participants.map((participant) => participant.teamName),
  athlete: settled.room.currentAthlete.name,
  winningTeam: winningTeam.teamName,
  acceptedBid: settled.room.currentBid,
  timerResetWindowMilliseconds: resetWindow,
  administratorControls: "pause/resume/stop verified",
  result: "PASS",
}, null, 2));
