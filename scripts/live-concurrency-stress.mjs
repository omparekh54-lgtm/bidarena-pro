import assert from "node:assert/strict";

const origin = "https://bidarena-pro-live.vercel.app";

async function request(path, init = {}, session) {
  const response = await fetch(origin + path, {
    ...init,
    headers: {
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(session ? { "x-bidarena-player": session.playerId, "x-bidarena-token": session.token } : {}),
      ...(init.headers || {}),
    },
  });
  let body = {};
  try { body = await response.json(); } catch {}
  return { ok: response.ok, status: response.status, body };
}

const create = await request("/api/rooms", {
  method: "POST",
  body: JSON.stringify({ teamName: "Stress Host" }),
});
assert.equal(create.ok, true, JSON.stringify(create));
const host = create.body.session;
const code = host.roomCode;

const joins = await Promise.all(
  Array.from({ length: 12 }, (_, i) => request(`/api/rooms/${code}/join`, {
    method: "POST",
    body: JSON.stringify({ teamName: `Stress Team ${i + 1}` }),
  })),
);
const successfulJoins = joins.filter((r) => r.ok);
const rejectedJoins = joins.filter((r) => !r.ok);
assert.equal(successfulJoins.length, 9, `expected 9 joins, got ${successfulJoins.length}: ${JSON.stringify(joins)}`);
assert.equal(rejectedJoins.length, 3);
assert.ok(rejectedJoins.every((r) => r.status === 409));

const guests = successfulJoins.map((r) => r.body.session);
const configure = await request(`/api/rooms/${code}/configure`, {
  method: "POST",
  body: JSON.stringify({ sport: "football", purse: 10000, playerPoolMode: "current" }),
}, host);
assert.equal(configure.ok, true, JSON.stringify(configure));

const start = await request(`/api/rooms/${code}/start`, { method: "POST" }, host);
assert.equal(start.ok, true, JSON.stringify(start));

await new Promise((resolve) => setTimeout(resolve, 3600));

const bidResults = await Promise.all(
  guests.map((session) => request(`/api/rooms/${code}/bid`, { method: "POST" }, session)),
);
assert.ok(bidResults.every((r) => r.status < 500), JSON.stringify(bidResults));
assert.equal(bidResults.filter((r) => r.ok).length, 9, JSON.stringify(bidResults));

const afterBids = await request(`/api/rooms/${code}`, {}, host);
assert.equal(afterBids.ok, true);
assert.equal(afterBids.body.room.participants.length, 10);
assert.equal(afterBids.body.room.bids.length, 9);
assert.ok(afterBids.body.room.leaderId);

const end = await request(`/api/rooms/${code}/session/end`, { method: "POST" }, host);
assert.equal(end.ok, true, JSON.stringify(end));

const allSessions = [host, ...guests];
const votes = await Promise.all(
  allSessions.map((session) => request(`/api/rooms/${code}/session/resume-vote`, { method: "POST" }, session)),
);
assert.ok(votes.every((r) => r.status < 500), JSON.stringify(votes));
assert.ok(votes.filter((r) => r.ok).length >= 8, JSON.stringify(votes));

const resumed = await request(`/api/rooms/${code}`, {}, host);
assert.equal(resumed.ok, true);
assert.equal(resumed.body.room.sessionResume.endedAt, null);

const stop = await request(`/api/rooms/${code}/stop`, { method: "POST" }, host);
assert.equal(stop.ok, true, JSON.stringify(stop));
assert.equal(stop.body.room.phase, "tournament-setup");

console.log(JSON.stringify({
  result: "PASS",
  roomCode: code,
  simultaneousJoinAttempts: 12,
  acceptedTeams: 10,
  concurrentBidsAccepted: bidResults.filter((r) => r.ok).length,
  concurrentResumeVotesAccepted: votes.filter((r) => r.ok).length,
  finalPhase: stop.body.room.phase,
}, null, 2));

// rerun against latest production deployment
