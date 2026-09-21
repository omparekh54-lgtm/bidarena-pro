import { describe, expect, it } from "vitest";
import { athleteCatalog } from "@/data/catalog";
import { addParticipant, configureRoom, createRoomState } from "./room-engine";
import { setupTournament } from "./tournament-engine";
import { startTournamentRoundWithCountdown } from "./tournament-round-service";
import type { RoomParticipant } from "./types";

function participant(id: string, name: string, color: string): RoomParticipant {
  return {
    id,
    teamName: name,
    code: name.slice(0, 2).toUpperCase(),
    color,
    budget: 10000,
    initialBudget: 10000,
    squad: [],
    joinedAt: new Date(0).toISOString(),
    tokenHash: `${id}-hash`,
  };
}

function addSquad(room: ReturnType<typeof createRoomState>, participantId: string, sport: "cricket" | "football", count: number) {
  const athletes = athleteCatalog.filter((athlete) => athlete.sport === sport).slice(0, count);
  const team = room.participants.find((candidate) => candidate.id === participantId)!;
  team.squad = athletes.map((athlete, index) => ({ athleteId: athlete.id, amount: 10 + index, acquiredAt: new Date(index + 1).toISOString() }));
}

describe("tournament resilience", () => {
  it("lets any connected player finish an expired round countdown if the host disconnects", () => {
    const admin = participant("admin", "Alpha", "#111");
    const guest = participant("guest", "Bravo", "#222");
    const room = createRoomState("2121", admin, 0);
    addParticipant(room, guest, 1);
    configureRoom(room, admin.id, "football", 500, "current", 2);
    addSquad(room, admin.id, "football", 7);
    addSquad(room, guest.id, "football", 7);
    room.phase = "tournament-setup";
    setupTournament(room, admin.id, "league", 20, 3);

    startTournamentRoundWithCountdown(room, admin.id, 1000);
    expect(room.tournament.roundPhase).toBe("countdown");

    startTournamentRoundWithCountdown(room, guest.id, 6001);
    expect(room.tournament.fixtures[0].status).toBe("complete");
    expect(room.tournament.fixtures[0].footballLineups?.[admin.id]?.starterIds).toHaveLength(7);
    expect(room.tournament.fixtures[0].footballLineups?.[guest.id]?.starterIds).toHaveLength(7);
  });

  it("repairs stale tournament lineup data without blocking the round", () => {
    const admin = participant("admin", "Alpha", "#111");
    const guest = participant("guest", "Bravo", "#222");
    const room = createRoomState("2122", admin, 0);
    addParticipant(room, guest, 1);
    configureRoom(room, admin.id, "cricket", 10000, "current", 2);
    addSquad(room, admin.id, "cricket", 8);
    addSquad(room, guest.id, "cricket", 6);
    room.phase = "tournament-setup";
    setupTournament(room, admin.id, "league", 10, 3);

    const fixture = room.tournament.fixtures[0];
    fixture.cricketLineups = {
      [admin.id]: { playingXi: ["missing-player"], battingOrder: ["missing-player"], bowlingPlan: [] },
    };

    startTournamentRoundWithCountdown(room, admin.id, 1000);
    startTournamentRoundWithCountdown(room, guest.id, 6001);

    expect(fixture.status).toBe("complete");
    expect(fixture.cricketLineups?.[admin.id]?.playingXi.every((id) => room.participants[0].squad.some((entry) => entry.athleteId === id))).toBe(true);
    expect(fixture.cricketLineups?.[guest.id]?.playingXi.length).toBe(6);
    expect(fixture.cricketLineups?.[guest.id]?.bowlingPlan).toHaveLength(10);
  });
});
