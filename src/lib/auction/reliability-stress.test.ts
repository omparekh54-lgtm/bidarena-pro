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
  pauseRoom,
  requestSessionResume,
  respondToTransferOffer,
  settleRoom,
  startRoom,
  stopRoom,
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
    const slice = Array.from({ length: 15 }, (_, offset) => athletes[(index * 15 + offset) % athletes.length]);
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

  it("processes the entire real-only auction pool without ever auto-completing", () => {
    const { room, admin } = tenTeamRoom("football");
    startRoom(room, admin.id, 100);
    room.participants.forEach((team) => {
      team.budget = 1_000_000;
      team.initialBudget = 1_000_000;
    });

    let now = 100;
    let sold = 0;
    const originalPoolSize = room.queue.length;
    expect(originalPoolSize).toBe(100);

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
    expect(room.participants.reduce((sum, team) => sum + team.squad.length, 0)).toBe(originalPoolSize);
  });

  it("recycles a large unsold pool instead of ending after one pass", () => {
    const { room, admin } = tenTeamRoom("cricket");
    startRoom(room, admin.id, 100);
    const poolSize = room.queue.length;
    let now = 100;

    for (let processed = 0; processed < poolSize; processed += 1) {
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
    expect(room.queue).toHaveLength(poolSize);
    expect(room.phase).not.toBe("complete");
  });

  it("does not let a transfer make the current auction leader unable to pay", () => {
    const { room, admin } = tenTeamRoom("football");
    startRoom(room, admin.id, 100);
    settleRoom(room, 3_300);
    const leader = room.participants[0];
    const other = room.participants[1];
    leader.budget = 500;
    other.budget = 500;
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
    expect(leader.budget).toBe(500);
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

  it("rejects auction-only admin controls after the tournament handoff", () => {
    const { room, admin } = tenTeamRoom("football");
    giveTournamentSquads(room, "football");
    room.phase = "tournament-setup";
    setupTournament(room, admin.id, "league", 20, 100);

    expect(room.phase).toBe("tournament");
    expect(() => openTransferWindow(room, admin.id, 60, 101)).toThrow();
    expect(() => pauseRoom(room, admin.id, 101)).toThrow();
    expect(() => stopRoom(room, admin.id, 101)).toThrow();
    expect(room.phase).toBe("tournament");
  });

  it("rejects transfers that would leave a team unable to finance eleven players", () => {
    const { room, admin } = tenTeamRoom("football");
    startRoom(room, admin.id, 100);
    const seller = room.participants[1];
    const buyer = room.participants[0];
    const pool = room.queue.slice(0, 22);

    buyer.squad = pool.slice(0, 10).map((athleteId, index) => ({ athleteId, amount: 10, acquiredAt: new Date(index + 1).toISOString() }));
    seller.squad = pool.slice(10, 21).map((athleteId, index) => ({ athleteId, amount: 10, acquiredAt: new Date(index + 20).toISOString() }));
    seller.budget = 0;

    openTransferWindow(room, admin.id, 60, 1_000);
    const offer = createTransferOffer(room, buyer.id, {
      type: "buy",
      toParticipantId: seller.id,
      offeredAthleteIds: [],
      requestedAthleteIds: [seller.squad[0].athleteId],
      cashAdjustment: 0,
    }, 1_001);

    expect(() => respondToTransferOffer(room, seller.id, offer.id, "accept", 1_002)).toThrow();
    expect(offer.status).toBe("pending");
    expect(seller.squad).toHaveLength(10);
  });

  it("does not enforce global 11-player supply when the selected real-only pool is too small", () => {
    const { room, admin } = tenTeamRoom("football");
    startRoom(room, admin.id, 100);
    settleRoom(room, 3_300);

    const bidder = room.participants[0];
    bidder.squad = room.queue.slice(1, 12).map((athleteId, index) => ({ athleteId, amount: 10, acquiredAt: new Date(index + 1).toISOString() }));
    bidder.budget = 1_000_000;

    const currentId = room.queue[room.lotIndex];
    const currentPool = athleteCatalog.filter((athlete) => athlete.sport === "football" && athlete.era === "current");
    const soldIds = currentPool.map((athlete) => athlete.id).filter((id) => id !== currentId).slice(0, currentPool.length - 11);
    room.sales = soldIds.map((athleteId, index) => ({
      athleteId,
      participantId: bidder.id,
      amount: 10,
      soldAt: new Date(index + 1).toISOString(),
    }));

    expect(() => bidForParticipant(room, bidder.id, 3_301)).not.toThrow();
    expect(room.leaderId).toBe(bidder.id);
    expect(room.phase).toBe("bidding");
  });

  for (const sport of ["football", "cricket"] as const) {
    for (let teamCount = 2; teamCount <= 10; teamCount += 1) {
      for (const format of ["league", "knockout"] as TournamentFormat[]) {
        it(`completes a ${teamCount}-team ${sport} ${format} tournament`, () => {
          const admin = participant("p0");
          const room = createRoomState(`7${teamCount}01`.slice(-4), admin, 0);
          for (let i = 1; i < teamCount; i += 1) addParticipant(room, participant(`p${i}`), i);
          configureRoom(room, admin.id, sport, 10000, "current", 20);
          giveTournamentSquads(room, sport);
          room.phase = "tournament-setup";
          setupTournament(room, admin.id, format, 20, 100);

          let guard = 0;
          while ((room.phase as string) !== "complete" && guard < 20) {
            startTournamentRound(room, admin.id, 200 + guard);
            guard += 1;
          }

          expect(guard).toBeLessThan(20);
          expect(room.phase).toBe("complete");
          expect(room.tournament.championParticipantId).toBeTruthy();
        });
      }
    }
  }

  for (const sport of ["football", "cricket"] as const) {
    for (let teamCount = 4; teamCount <= 10; teamCount += 1) {
      for (const format of ["league-knockout", "groups-knockout"] as TournamentFormat[]) {
        it(`completes a ${teamCount}-team ${sport} ${format} tournament`, () => {
          const admin = participant("p0");
          const room = createRoomState(`8${teamCount}01`.slice(-4), admin, 0);
          for (let i = 1; i < teamCount; i += 1) addParticipant(room, participant(`p${i}`), i);
          configureRoom(room, admin.id, sport, 10000, "current", 20);
          giveTournamentSquads(room, sport);
          room.phase = "tournament-setup";
          setupTournament(room, admin.id, format, 20, 100);

          let guard = 0;
          while ((room.phase as string) !== "complete" && guard < 30) {
            startTournamentRound(room, admin.id, 200 + guard);
            guard += 1;
          }

          expect(guard).toBeLessThan(30);
          expect(room.phase).toBe("complete");
          expect(room.tournament.championParticipantId).toBeTruthy();
        });
      }
    }
  }

  it("rejects knockout formats that require four teams before creating broken fixtures", () => {
    const admin = participant("p0");
    const room = createRoomState("8801", admin, 0);
    addParticipant(room, participant("p1"), 1);
    addParticipant(room, participant("p2"), 2);
    configureRoom(room, admin.id, "football", 10000, "current", 20);
    room.phase = "tournament-setup";

    expect(() => setupTournament(room, admin.id, "league-knockout", 20, 100)).toThrow();
    expect(() => setupTournament(room, admin.id, "groups-knockout", 20, 100)).toThrow();
    expect(room.phase).toBe("tournament-setup");
  });


  for (const sport of ["football", "cricket"] as const) {
    for (const format of ["league", "league-knockout", "knockout", "groups-knockout"] as TournamentFormat[]) {
      it(`completes a 12-team ${sport} ${format} tournament without deadlock`, () => {
        const admin = participant("p0");
        const room = createRoomState("9212", admin, 0);
        for (let i = 1; i < 12; i += 1) addParticipant(room, participant(`p${i}`), i);
        configureRoom(room, admin.id, sport, 10000, "current", 20);
        giveTournamentSquads(room, sport);
        room.phase = "tournament-setup";
        setupTournament(room, admin.id, format, 20, 100);

        let guard = 0;
        while ((room.phase as string) !== "complete" && guard < 40) {
          startTournamentRound(room, admin.id, 200 + guard);
          guard += 1;
        }

        expect(guard).toBeLessThan(40);
        expect(room.participants).toHaveLength(12);
        expect(room.phase).toBe("complete");
        expect(room.tournament.status).toBe("complete");
        expect(room.tournament.championParticipantId).toBeTruthy();
      });
    }
  }

});
