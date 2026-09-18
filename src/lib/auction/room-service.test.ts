import { describe, expect, it } from "vitest";
import { athleteCatalog } from "@/data/catalog";
import {
  approveResumeTeamClaim,
  configureGame,
  createGame,
  endGameSession,
  getResumeGameInfo,
  getResumeTeamClaimStatus,
  joinGame,
  requestResumeTeamClaim,
  startGame,
  stopGame,
} from "./room-service";
import { mutateStoredRoom } from "./room-store";

describe("auction room service tournament handoff", () => {
  it("rejects non-admin stop and moves the admin into tournament setup", async () => {
    const { session } = await createGame("Snapshot United");
    const { session: challenger } = await joinGame(session.roomCode, "Challenger City");
    await configureGame(session.roomCode, session.playerId, session.token, "football", 500, "current");
    await startGame(session.roomCode, session.playerId, session.token);
    const athlete = athleteCatalog.find((candidate) => candidate.sport === "football" && candidate.era === "current")!;
    await mutateStoredRoom(session.roomCode, (room) => {
      room.participants[0].budget = 455;
      room.participants[0].squad.push({ athleteId: athlete.id, amount: 45, acquiredAt: new Date(10).toISOString() });
    });

    await expect(stopGame(session.roomCode, challenger.playerId, challenger.token)).rejects.toMatchObject({ status: 403, code: "ADMIN_ONLY" });
    const stopped = await stopGame(session.roomCode, session.playerId, session.token);

    expect(stopped.phase).toBe("tournament-setup");
    expect(stopped.tournament.status).toBe("setup");
    expect(stopped.participants[0].budget).toBe(455);
    expect(stopped.participants[0].squad[0]).toMatchObject({ athleteId: athlete.id, amount: 45, athlete: { name: athlete.name } });
  });

  it("lets a new device request a saved team and receive access only after host approval", async () => {
    const { session: host } = await createGame("Host XI");
    const { session: guest } = await joinGame(host.roomCode, "Guest XI");
    await configureGame(host.roomCode, host.playerId, host.token, "cricket", 10000, "current");
    await startGame(host.roomCode, host.playerId, host.token);
    await endGameSession(host.roomCode, host.playerId, host.token);

    const info = await getResumeGameInfo(host.roomCode);
    expect(info.participants.map((team) => team.teamName)).toEqual(["Host XI", "Guest XI"]);
    const guestInfo = info.participants.find((team) => team.id === guest.playerId)!;

    const claim = await requestResumeTeamClaim(host.roomCode, guestInfo.id);
    const pending = await getResumeTeamClaimStatus(host.roomCode, claim.claimId, claim.claimToken);
    expect(pending.approved).toBe(false);

    const hostView = await approveResumeTeamClaim(host.roomCode, host.playerId, host.token, claim.claimId);
    expect(hostView.sessionResume.claims.find((candidate) => candidate.id === claim.claimId)?.approvedAt).toBeTruthy();

    const approved = await getResumeTeamClaimStatus(host.roomCode, claim.claimId, claim.claimToken);
    expect(approved.approved).toBe(true);
    if (!approved.approved) throw new Error("claim should be approved");
    expect(approved.session.playerId).toBe(guest.playerId);
    expect(approved.session.teamName).toBe("Guest XI");
  });
});
