import { describe, expect, it } from "vitest";
import { athleteCatalog } from "@/data/catalog";
import { configureGame, createGame, getFinalResult, joinGame, startGame, stopGame } from "./room-service";
import { mutateStoredRoom } from "./room-store";

describe("auction room service finalization", () => {
  it("rejects non-admin stop and permanently snapshots the admin stop result", async () => {
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
    const result = await getFinalResult(session.roomCode);

    expect(stopped.phase).toBe("complete");
    expect(result.completedAt).toBe(stopped.stoppedAt);
    expect(result.participants[0].finalBudget).toBe(455);
    expect(result.participants[0].squad[0]).toMatchObject({ athleteId: athlete.id, amount: 45, athlete: { name: athlete.name } });
  });
});
