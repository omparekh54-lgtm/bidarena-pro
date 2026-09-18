import { describe, expect, it } from "vitest";
import { athleteCatalog } from "@/data/catalog";
import { configureGame, createGame, joinGame, startGame, stopGame } from "./room-service";
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
});
