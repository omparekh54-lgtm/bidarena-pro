import { describe, expect, it } from "vitest";
import { athleteCatalog } from "@/data/catalog";
import { addParticipant, configureRoom, createRoomState, endSession, requestSessionResume, stopRoom } from "./room-engine";
import { callToss, setupTournament, startTournamentRound, submitCricketLineup } from "./tournament-engine";
import type { CricketLineup, RoomParticipant } from "./types";

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

function addSquad(room: ReturnType<typeof createRoomState>, participantId: string, sport: "cricket" | "football") {
  const athletes = athleteCatalog.filter((athlete) => athlete.sport === sport).slice(0, 15);
  const team = room.participants.find((candidate) => candidate.id === participantId)!;
  team.squad = athletes.map((athlete, index) => ({ athleteId: athlete.id, amount: 10 + index, acquiredAt: new Date(index + 1).toISOString() }));
}

describe("tournament engine regression coverage", () => {
  it("generates 45 league fixtures for ten teams with five matches per round", () => {
    const admin = participant("p0", "Team 0", "#111");
    const room = createRoomState("1111", admin, 0);
    for (let i = 1; i < 10; i += 1) addParticipant(room, participant(`p${i}`, `Team ${i}`, `#${i}${i}${i}`), i);
    configureRoom(room, admin.id, "football", 500, "current", 20);
    room.phase = "tournament-setup";
    setupTournament(room, admin.id, "league", 20, 30);
    expect(room.tournament.fixtures).toHaveLength(45);
    expect(room.tournament.fixtures.filter((fixture) => fixture.round === 1)).toHaveLength(5);
    for (let round = 1; round <= 9; round += 1) {
      const ids = room.tournament.fixtures
        .filter((fixture) => fixture.round === round)
        .flatMap((fixture) => [fixture.homeParticipantId, fixture.awayParticipantId]);
      expect(new Set(ids).size).toBe(10);
    }
  });

  it("creates two preliminary matches for a ten-team straight knockout", () => {
    const admin = participant("p0", "Team 0", "#111");
    const room = createRoomState("1112", admin, 0);
    for (let i = 1; i < 10; i += 1) addParticipant(room, participant(`p${i}`, `Team ${i}`, `#${i}${i}${i}`), i);
    configureRoom(room, admin.id, "football", 500, "current", 20);
    room.phase = "tournament-setup";
    setupTournament(room, admin.id, "knockout", 20, 30);
    expect(room.tournament.fixtures.filter((fixture) => fixture.round === 1)).toHaveLength(2);
  });

  it("honors first-claim toss behavior when both teams request the same side", () => {
    const admin = participant("admin", "Alpha", "#111");
    const guest = participant("guest", "Bravo", "#222");
    const room = createRoomState("1113", admin, 0);
    addParticipant(room, guest, 1);
    configureRoom(room, admin.id, "cricket", 10000, "current", 2);
    room.phase = "tournament-setup";
    setupTournament(room, admin.id, "league", 20, 3);
    const fixture = room.tournament.fixtures[0];
    callToss(room, admin.id, fixture.id, "heads", 4);
    callToss(room, guest.id, fixture.id, "heads", 5);
    expect(fixture.toss?.calls[admin.id]).toBe("heads");
    expect(fixture.toss?.calls[guest.id]).toBe("tails");
    expect(fixture.toss?.winnerParticipantId).toBeTruthy();
  });

  it("rejects invalid consecutive bowling plans and accepts exact over-by-over plans", () => {
    const admin = participant("admin", "Alpha", "#111");
    const guest = participant("guest", "Bravo", "#222");
    const room = createRoomState("1114", admin, 0);
    addParticipant(room, guest, 1);
    configureRoom(room, admin.id, "cricket", 10000, "current", 2);
    addSquad(room, admin.id, "cricket");
    addSquad(room, guest.id, "cricket");
    room.phase = "tournament-setup";
    setupTournament(room, admin.id, "league", 20, 3);
    const fixture = room.tournament.fixtures[0];
    const xi = room.participants[0].squad.slice(0, 11).map((entry) => entry.athleteId);
    const invalid: CricketLineup = { playingXi: xi, battingOrder: xi, bowlingPlan: Array(20).fill(xi[0]) };
    expect(() => submitCricketLineup(room, admin.id, fixture.id, invalid, 4)).toThrow();
    const bowlers = xi.slice(0, 5);
    const valid: CricketLineup = { playingXi: xi, battingOrder: xi, bowlingPlan: Array.from({ length: 20 }, (_, index) => bowlers[index % 5]) };
    expect(() => submitCricketLineup(room, admin.id, fixture.id, valid, 5)).not.toThrow();
  });

  it("auto-fills missing teams so one absent owner does not freeze a football round", () => {
    const admin = participant("admin", "Alpha", "#111");
    const guest = participant("guest", "Bravo", "#222");
    const room = createRoomState("1115", admin, 0);
    addParticipant(room, guest, 1);
    configureRoom(room, admin.id, "football", 500, "current", 2);
    addSquad(room, admin.id, "football");
    addSquad(room, guest.id, "football");
    room.phase = "tournament-setup";
    setupTournament(room, admin.id, "league", 20, 3);
    startTournamentRound(room, admin.id, 4);
    expect(room.tournament.fixtures[0].status).toBe("complete");
    expect(room.tournament.fixtures[0].footballLineups?.[admin.id]?.starterIds).toHaveLength(11);
    expect(room.tournament.fixtures[0].footballLineups?.[guest.id]?.starterIds).toHaveLength(11);
    expect(room.phase).toBe("complete");
  });

  it("starts football simulation when one squad has fewer than 11 players", () => {
    const admin = participant("admin", "Alpha", "#111");
    const guest = participant("guest", "Bravo", "#222");
    const room = createRoomState("1118", admin, 0);
    addParticipant(room, guest, 1);
    configureRoom(room, admin.id, "football", 500, "current", 2);
    addSquad(room, admin.id, "football");
    const guestTeam = room.participants.find((candidate) => candidate.id === guest.id)!;
    guestTeam.squad = guestTeam.squad.slice(0, 7);
    room.phase = "tournament-setup";
    setupTournament(room, admin.id, "league", 20, 3);
    startTournamentRound(room, admin.id, 4);
    const fixture = room.tournament.fixtures[0];
    expect(fixture.status).toBe("complete");
    expect(fixture.result?.summary).toMatch(/^\d+-\d+$/);
    expect(fixture.footballLineups?.[guest.id]).toBeTruthy();
    expect(room.phase).toBe("complete");
  });

  it("auto-fills cricket plans, completes a match, and calculates finite NRR", () => {
    const admin = participant("admin", "Alpha", "#111");
    const guest = participant("guest", "Bravo", "#222");
    const room = createRoomState("1116", admin, 0);
    addParticipant(room, guest, 1);
    configureRoom(room, admin.id, "cricket", 10000, "current", 2);
    addSquad(room, admin.id, "cricket");
    addSquad(room, guest.id, "cricket");
    room.phase = "tournament-setup";
    setupTournament(room, admin.id, "league", 20, 3);
    startTournamentRound(room, admin.id, 4);
    expect(room.tournament.fixtures[0].status).toBe("complete");
    expect(room.tournament.fixtures[0].cricketLineups?.[admin.id]?.bowlingPlan).toHaveLength(20);
    expect(room.tournament.standings.every((row) => Number.isFinite(row.nrr))).toBe(true);
    expect(room.tournament.standings.some((row) => row.nrr !== 0)).toBe(true);
  });

  it("starts cricket simulation when one squad has fewer than 11 players", () => {
    const admin = participant("admin", "Alpha", "#111");
    const guest = participant("guest", "Bravo", "#222");
    const room = createRoomState("1119", admin, 0);
    addParticipant(room, guest, 1);
    configureRoom(room, admin.id, "cricket", 10000, "current", 2);
    addSquad(room, admin.id, "cricket");
    const guestTeam = room.participants.find((candidate) => candidate.id === guest.id)!;
    guestTeam.squad = guestTeam.squad.slice(0, 7);
    room.phase = "tournament-setup";
    setupTournament(room, admin.id, "league", 20, 3);
    startTournamentRound(room, admin.id, 4);
    const fixture = room.tournament.fixtures[0];
    expect(fixture.status).toBe("complete");
    expect(fixture.result?.summary).toContain("won");
    expect(fixture.cricketLineups?.[guest.id]).toBeTruthy();
    expect(room.phase).toBe("complete");
  });

  it("requires ceil(75%) resume votes and keeps a transfer-window pause intact", () => {
    const admin = participant("p0", "Team 0", "#111");
    const room = createRoomState("1117", admin, 0);
    for (let i = 1; i < 10; i += 1) addParticipant(room, participant(`p${i}`, `Team ${i}`, `#${i}${i}${i}`), i);
    configureRoom(room, admin.id, "football", 500, "current", 20);
    room.phase = "bidding";
    room.pausedAt = new Date(100).toISOString();
    room.transferWindow.status = "open";
    room.transferWindow.startedAt = new Date(100).toISOString();
    room.transferWindow.endsAt = new Date(10000).toISOString();
    room.transferWindow.durationSeconds = 10;
    room.transferWindow.resumeAuctionOnClose = true;
    endSession(room, admin.id, 200);
    for (let i = 0; i < 7; i += 1) requestSessionResume(room, `p${i}`, 300 + i);
    expect(room.sessionResume.endedAt).not.toBeNull();
    requestSessionResume(room, "p7", 400);
    expect(room.sessionResume.endedAt).toBeNull();
    expect(room.pausedAt).not.toBeNull();
  });
});
