import { describe, expect, it } from "vitest";
import { athleteCatalog } from "@/data/catalog";
import {
  addParticipant,
  bidForParticipant,
  configureRoom,
  createRoomState,
  createTransferOffer,
  endSession,
  openTransferWindow,
  requestSessionResume,
  respondToTransferOffer,
  settleRoom,
  startRoom,
} from "./room-engine";
import { minimumBasePriceForPool } from "./engine";
import { setupTournament, startTournamentRound } from "./tournament-engine";
import type { RoomParticipant, Sport, TournamentFormat } from "./types";

function participant(id: string): RoomParticipant {
  return {
    id,
    teamName: `Team ${id}`,
    code: id.slice(0, 2).toUpperCase(),
    color: "#888",
    budget: 0,
    initialBudget: 0,
    squad: [],
    joinedAt: new Date(0).toISOString(),
    tokenHash: id.repeat(8).slice(0, 64),
  };
}

function tenTeamRoom(sport: Sport) {
  const admin = participant("p0");
  const room = createRoomState("9001", admin, 0);
  for (let i = 1; i < 10; i += 1) addParticipant(room, participant(`p${i}`), i);
  configureRoom(room, admin.id, sport, sport === "cricket" ? 10000 : 10000, "current", 20);
  return { room, admin };
}

function giveTournamentSquads(room: ReturnType<typeof createRoomState>, sport: Sport) {
  const athletes = athleteCatalog.filter((athlete) => athlete.sport === sport);
  room.participants.forEach((team, index) => {
    const slice = athletes.slice(index * 15, index * 15 + 15);
    team.squad = slice.map((athlete, offset) => ({
      athleteId: athlete.id,
      amount: 10 + offset,
      acquiredAt: new Date(offset + 1).toISOString(),
    }));
  });
}

describe("full-game reliability stress", () => {
  it("keeps reserve floors aligned with every auction pool", () => {
    expect(minimumBasePriceForPool("football", "current")).toBe(10);
    expect(minimumBasePriceForPool("football", "mixed")).toBe(10);
    expect(minimumBasePriceForPool("football", "legends")).toBe(30);
    expect(minimumBasePriceForPool("cricket", "current")).toBe(50);
    expect(minimumBasePriceForPool("cricket", "mixed")).toBe(50);
    expect(minimumBasePriceForPool("cricket", "legends")).toBe(150);
  });

  it("blocks bids that would make an 11-player cricket squad financially impossible", () => {
    const { room, admin } = tenTeamRoom("cricket");
    startRoom(room, admin.id, 100);
    settleRoom(room, 3_300);
    const bidder = room.participants[0];
    bidder.budget = 549;
    bidder.initialBudget = 549;

    expect(() => bidForParticipant(room, bidder.id, 3_301)).toThrow();
    expect(bidder.squad).toHaveLength(0);
    expect(room.leaderId).toBeNull();
  });

  it("processes the entire 300-player auction without ever auto-completing", () => {
    const { room, admin } = tenTeamRoom("football");
    startRoom(room, admin.id, 100);
    room.participants.forEach((team) => {
      team.budget = 1_000_000;
      team.initialBudget = 1_000_000;
    });

    let now = 100;
    let sold = 0;
    const originalPoolSize = room.queue.length;
    expect(originalPoolSize).toBeGreaterThanOrEqual(300);

    while (room.phase !== "between-lots") {
      expect(room.phase).not.toBe("complete");
      if (room.phase === "reveal") {
        now += 3_200;
        settleRoom(room, now);
      } else if (room.phase === "bidding") {
        const buyer = room.participants[sold % room.participants.length];
        bidForParticipant(room, buyer.id, now + 1);
        now = Date.parse(room.deadlineAt!);
        settleRoom(room, now);
        sold += 1;
      } else if (room.phase === "sold" || room.phase === "unsold") {
        now = Date.parse(room.transitionAt!);
        settleRoom(room, now);
      } else {
        throw new Error(`Unexpected auction phase ${room.phase}`);
      }
      expect(sold).toBeLessThanOrEqual(originalPoolSize);
    }

    expect(sold).toBe(originalPoolSize);
    expect(room.sales).toHaveLength(originalPoolSize);
    expect(room.phase).toBe("between-lots");
    expect(room.phase).not.toBe("complete");
    expect(room.participants.every((team) => team.squad.length >= 11)).toBe(true);
  });

  it("recycles a large unsold pool instead of ending after one pass", () => {
    const { room, admin } = tenTeamRoom("cricket");
    startRoom(room, admin.id, 100);
    room.queue = room.queue.slice(0, 120);
    let now = 100;

    for (let processed = 0; processed < 120; processed += 1) {
      now += 3_200;
      settleRoom(room, now);
      expect(room.phase).toBe("bidding");
      now = Date.parse(room.deadlineAt!);
      settleRoom(room, now);
      expect(room.phase).toBe("unsold");
      now = Date.parse(room.transitionAt!);
      settleRoom(room, now);
    }

    expect(room.phase).toBe("reveal");
    expect(room.cycleCount).toBe(2);
    expect(room.queue).toHaveLength(120);
    expect(room.phase).not.toBe("complete");
  });

  it("does not let a transfer make the current auction leader unable to pay", () => {
    const { room, admin } = tenTeamRoom("football");
    startRoom(room, admin.id, 100);
    settleRoom(room, 3_300);
    const leader = room.participants[0];
    const other = room.participants[1];
    leader.budget = 120;
    other.budget = 120;
    bidForParticipant(room, leader.id, 3_301);
    const committed = room.currentBid;

    const transferable = room.queue[1];
    other.squad.push({ athleteId: transferable, amount: 10, acquiredAt: new Date(1).toISOString() });
    openTransferWindow(room, admin.id, 60, 3_302);
    const offer = createTransferOffer(room, leader.id, {
      type: "buy",
      toParticipantId: other.id,
      offeredAthleteIds: [],
      requestedAthleteIds: [transferable],
      cashAdjustment: Math.max(1, leader.budget - committed + 1),
    }, 3_303);

    expect(() => respondToTransferOffer(room, other.id, offer.id, "accept", 3_304)).toThrow();
    expect(leader.budget).toBe(100);
    expect(offer.status).toBe("pending");
  });

  it("freezes the remaining transfer-window time across a saved multi-day session", () => {
    const { room, admin } = tenTeamRoom("football");
    startRoom(room, admin.id, 100);
    openTransferWindow(room, admin.id, 300, 1_000);
    const originalEndsAt = Date.parse(room.transferWindow.endsAt!);
    endSession(room, admin.id, 2_000);

    const resumeAt = 86_402_000;
    for (let i = 0; i < 8; i += 1) requestSessionResume(room, room.participants[i].id, resumeAt + i);

    expect(room.sessionResume.endedAt).toBeNull();
    expect(room.transferWindow.status).toBe("open");
    const thresholdReachedAt = resumeAt + 7;
    const remainingAtSave = originalEndsAt - 2_000;
    expect(Date.parse(room.transferWindow.endsAt!)).toBe(thresholdReachedAt + remainingAtSave);
    settleRoom(room, resumeAt + 10);
    expect(room.transferWindow.status).toBe("open");
  });

  for (const sport of ["football", "cricket"] as const) {
    for (const format of ["league", "league-knockout", "knockout", "groups-knockout"] as TournamentFormat[]) {
      it(`completes a 10-team ${sport} ${format} tournament without deadlock`, () => {
        const { room, admin } = tenTeamRoom(sport);
        giveTournamentSquads(room, sport);
        room.phase = "tournament-setup";
        setupTournament(room, admin.id, format, sport === "cricket" ? 20 : 20, 100);

        let guard = 0;
        while ((room.phase as string) !== "complete" && guard < 20) {
          startTournamentRound(room, admin.id, 200 + guard);
          guard += 1;
        }

        expect(guard).toBeLessThan(20);
        expect(room.phase).toBe("complete");
        expect(room.tournament.status).toBe("complete");
        expect(room.tournament.championParticipantId).toBeTruthy();
        expect(room.tournament.fixtures.every((fixture) => fixture.status === "complete")).toBe(true);
      });
    }
  }
});
