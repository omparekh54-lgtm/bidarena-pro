import { describe, expect, it } from "vitest";
import { AuctionError } from "./errors";
import { athleteCatalog } from "@/data/catalog";
import {
  BID_WINDOW_MS,
  REVEAL_WINDOW_MS,
  RESULT_WINDOW_MS,
  addParticipant,
  bidForParticipant,
  buildAuctionQueue,
  configureRoom,
  createTransferOffer,
  createRoomState,
  openTransferWindow,
  pauseRoom,
  respondToTransferOffer,
  resumeRoom,
  settleRoom,
  startRoom,
  stopRoom,
  toRoomView,
} from "./room-engine";
import type { RoomParticipant } from "./types";

function participant(id: string, name: string, color: string): RoomParticipant {
  return {
    id,
    teamName: name,
    code: name.slice(0, 2).toUpperCase(),
    color,
    budget: 1200,
    initialBudget: 1200,
    squad: [],
    joinedAt: new Date(0).toISOString(),
    tokenHash: `${id}-hash`,
  };
}

describe("server-authoritative auction room", () => {
  it("opens bidding after reveal and resets the full ten-second window after every bid", () => {
    const admin = participant("admin", "Alpha Eleven", "#56e0c4");
    const challenger = participant("challenger", "Bravo United", "#ff6b67");
    const room = createRoomState("1234", admin, 0);
    addParticipant(room, challenger, 1);
    configureRoom(room, admin.id, "football", 500, "current", 2);
    startRoom(room, admin.id, 10);

    expect(room.phase).toBe("reveal");
    settleRoom(room, 10 + REVEAL_WINDOW_MS);
    expect(room.phase).toBe("bidding");
    expect(Date.parse(room.deadlineAt!)).toBe(10 + REVEAL_WINDOW_MS + BID_WINDOW_MS);

    const firstBidAt = 5_000;
    const firstAmount = bidForParticipant(room, admin.id, firstBidAt);
    expect(firstAmount).toBe(room.currentBid);
    expect(Date.parse(room.deadlineAt!)).toBe(firstBidAt + BID_WINDOW_MS);

    const secondBidAt = 12_000;
    const secondAmount = bidForParticipant(room, challenger.id, secondBidAt);
    expect(secondAmount).toBeGreaterThan(firstAmount);
    expect(room.leaderId).toBe(challenger.id);
    expect(Date.parse(room.deadlineAt!)).toBe(secondBidAt + BID_WINDOW_MS);
  });

  it("automatically sells to the highest bidder and adds the player to that team", () => {
    const admin = participant("admin", "Alpha Eleven", "#56e0c4");
    const winner = participant("winner", "Bravo United", "#ff6b67");
    const room = createRoomState("2345", admin, 0);
    addParticipant(room, winner, 1);
    configureRoom(room, admin.id, "cricket", 10_000, "current", 2);
    startRoom(room, admin.id, 10);
    settleRoom(room, 10 + REVEAL_WINDOW_MS);
    bidForParticipant(room, winner.id, 4_000);
    const closingTime = Date.parse(room.deadlineAt!);

    settleRoom(room, closingTime);
    expect(room.phase).toBe("sold");
    expect(room.sales).toHaveLength(1);
    expect(room.sales[0].participantId).toBe(winner.id);
    expect(winner.squad).toHaveLength(1);
    expect(winner.budget).toBe(10_000 - room.sales[0].amount);

    settleRoom(room, closingTime + RESULT_WINDOW_MS);
    expect(room.phase).toBe("reveal");
    expect(room.lotIndex).toBe(1);
  });

  it("marks a player unsold when the ten-second window expires without a bid", () => {
    const admin = participant("admin", "Alpha Eleven", "#56e0c4");
    const room = createRoomState("3456", admin, 0);
    configureRoom(room, admin.id, "football", 500, "current", 1);
    startRoom(room, admin.id, 10);
    settleRoom(room, 10 + REVEAL_WINDOW_MS);
    const closingTime = Date.parse(room.deadlineAt!);

    settleRoom(room, closingTime);
    expect(room.phase).toBe("unsold");
    expect(room.unsoldAthleteIds).toEqual([room.queue[0]]);
    expect(room.sales).toHaveLength(0);
  });

  it("rejects administrator commands from another team", () => {
    const admin = participant("admin", "Alpha Eleven", "#56e0c4");
    const room = createRoomState("4567", admin, 0);
    expect(() => configureRoom(room, "attacker", "cricket", 10_000, "current", 1)).toThrowError(AuctionError);
    expect(room.sport).toBeNull();
  });

  it("uses the administrator's purse for every existing and future team", () => {
    const admin = participant("admin", "Alpha Eleven", "#56e0c4");
    const room = createRoomState("5678", admin, 0);
    configureRoom(room, admin.id, "cricket", 10_000, "current", 1);
    const lateJoiner = participant("late", "Late Lions", "#ff6b67");
    addParticipant(room, lateJoiner, 2);

    expect(room.purse).toBe(10_000);
    expect(room.participants.every((team) => team.budget === 10_000 && team.initialBudget === 10_000)).toBe(true);
  });

  it("freezes the authoritative timer while paused and resumes with the same time remaining", () => {
    const admin = participant("admin", "Alpha Eleven", "#56e0c4");
    const room = createRoomState("6789", admin, 0);
    configureRoom(room, admin.id, "football", 500, "current", 1);
    startRoom(room, admin.id, 10);
    settleRoom(room, 10 + REVEAL_WINDOW_MS);
    const originalDeadline = Date.parse(room.deadlineAt!);
    const pauseAt = originalDeadline - 4_000;

    pauseRoom(room, admin.id, pauseAt);
    settleRoom(room, originalDeadline + 60_000);
    expect(room.phase).toBe("bidding");
    expect(() => bidForParticipant(room, admin.id, originalDeadline + 1)).toThrowError(AuctionError);

    const resumeAt = pauseAt + 20_000;
    resumeRoom(room, admin.id, resumeAt);
    expect(Date.parse(room.deadlineAt!)).toBe(originalDeadline + 20_000);
    settleRoom(room, originalDeadline + 19_999);
    expect(room.phase).toBe("bidding");
  });

  it("lets only the administrator stop an active auction", () => {
    const admin = participant("admin", "Alpha Eleven", "#56e0c4");
    const room = createRoomState("7890", admin, 0);
    configureRoom(room, admin.id, "football", 500, "current", 1);
    startRoom(room, admin.id, 2);
    expect(() => stopRoom(room, "attacker", 3)).toThrowError(AuctionError);
    stopRoom(room, admin.id, 4);
    expect(room.phase).toBe("complete");
    expect(room.stoppedAt).toBe(new Date(4).toISOString());
  });

  it("recycles unsold athletes into a new pool round instead of completing", () => {
    const admin = participant("admin", "Alpha Eleven", "#56e0c4");
    const room = createRoomState("7901", admin, 0);
    configureRoom(room, admin.id, "football", 500, "current", 1);
    startRoom(room, admin.id, 2);
    room.queue = room.queue.slice(0, 1);
    settleRoom(room, 2 + REVEAL_WINDOW_MS);
    const athleteId = room.queue[0];
    const deadline = Date.parse(room.deadlineAt!);
    settleRoom(room, deadline);
    expect(room.phase).toBe("unsold");
    settleRoom(room, deadline + RESULT_WINDOW_MS);

    expect(room.phase).toBe("reveal");
    expect(room.queue).toEqual([athleteId]);
    expect(room.lotIndex).toBe(0);
    expect(room.cycleCount).toBe(2);
    expect(room.phase).not.toBe("complete");
  });

  it("waits for the host when every athlete has been sold", () => {
    const admin = participant("admin", "Alpha Eleven", "#56e0c4");
    const room = createRoomState("7902", admin, 0);
    configureRoom(room, admin.id, "football", 500, "current", 1);
    startRoom(room, admin.id, 2);
    room.queue = room.queue.slice(0, 1);
    settleRoom(room, 2 + REVEAL_WINDOW_MS);
    bidForParticipant(room, admin.id, 4_000);
    const deadline = Date.parse(room.deadlineAt!);
    settleRoom(room, deadline);
    settleRoom(room, deadline + RESULT_WINDOW_MS);

    expect(room.phase).toBe("between-lots");
    expect(room.queue).toHaveLength(0);
    expect(room.stoppedAt).toBeNull();
    expect(room.phase).not.toBe("complete");
    stopRoom(room, admin.id, deadline + RESULT_WINDOW_MS + 1);
    expect(room.phase).toBe("complete");
  });

  it("opens, trades atomically, and auto-closes the transfer window", () => {
    const admin = participant("admin", "Alpha Eleven", "#56e0c4");
    const challenger = participant("challenger", "Bravo United", "#ff6b67");
    const room = createRoomState("7903", admin, 0);
    addParticipant(room, challenger, 1);
    configureRoom(room, admin.id, "football", 500, "current", 2);
    startRoom(room, admin.id, 10);
    const [adminAthlete, challengerAthlete] = room.queue.slice(0, 2);
    admin.squad.push({ athleteId: adminAthlete, amount: 20, acquiredAt: new Date(3).toISOString() });
    challenger.squad.push({ athleteId: challengerAthlete, amount: 30, acquiredAt: new Date(3).toISOString() });

    openTransferWindow(room, admin.id, 30, 100);
    expect(room.transferWindow.status).toBe("open");
    expect(room.pausedAt).toBe(new Date(100).toISOString());
    const offer = createTransferOffer(room, admin.id, {
      type: "swap",
      toParticipantId: challenger.id,
      offeredAthleteIds: [adminAthlete],
      requestedAthleteIds: [challengerAthlete],
      cashAdjustment: 25,
    }, 200);
    respondToTransferOffer(room, challenger.id, offer.id, "accept", 300);

    expect(admin.squad.map((entry) => entry.athleteId)).toEqual([challengerAthlete]);
    expect(challenger.squad.map((entry) => entry.athleteId)).toEqual([adminAthlete]);
    expect(admin.budget).toBe(475);
    expect(challenger.budget).toBe(525);
    expect(offer.status).toBe("accepted");

    settleRoom(room, 30_100);
    expect(room.transferWindow.status).toBe("closed");
    expect(room.pausedAt).toBeNull();
    expect(room.phase).not.toBe("complete");
  });

  it("rejects stale or unaffordable transfer acceptance", () => {
    const admin = participant("admin", "Alpha Eleven", "#56e0c4");
    const challenger = participant("challenger", "Bravo United", "#ff6b67");
    const room = createRoomState("7904", admin, 0);
    addParticipant(room, challenger, 1);
    configureRoom(room, admin.id, "football", 500, "current", 2);
    startRoom(room, admin.id, 10);
    const athleteId = room.queue[0];
    challenger.squad.push({ athleteId, amount: 20, acquiredAt: new Date(3).toISOString() });
    openTransferWindow(room, admin.id, 30, 100);
    const offer = createTransferOffer(room, admin.id, {
      type: "buy",
      toParticipantId: challenger.id,
      offeredAthleteIds: [],
      requestedAthleteIds: [athleteId],
      cashAdjustment: 501,
    }, 200);
    expect(() => respondToTransferOffer(room, challenger.id, offer.id, "accept", 300)).toThrowError(AuctionError);
    expect(offer.status).toBe("pending");
    expect(challenger.squad).toHaveLength(1);
  });

  it("auto-expires pending offers and restores private squad visibility", () => {
    const admin = participant("admin", "Alpha Eleven", "#56e0c4");
    const challenger = participant("challenger", "Bravo United", "#ff6b67");
    const room = createRoomState("7906", admin, 0);
    addParticipant(room, challenger, 1);
    configureRoom(room, admin.id, "football", 500, "current", 2);
    startRoom(room, admin.id, 10);
    const athleteId = room.queue[0];
    challenger.squad.push({ athleteId, amount: 20, acquiredAt: new Date(3).toISOString() });
    expect(toRoomView(room, admin.id, 50).participants.find((team) => team.id === challenger.id)?.squad).toHaveLength(0);
    openTransferWindow(room, admin.id, 30, 100);
    const offer = createTransferOffer(room, admin.id, { type: "buy", toParticipantId: challenger.id, offeredAthleteIds: [], requestedAthleteIds: [athleteId], cashAdjustment: 20 }, 200);
    expect(toRoomView(room, admin.id, 250).participants.find((team) => team.id === challenger.id)?.squad).toHaveLength(1);

    settleRoom(room, 30_100);
    expect(offer.status).toBe("expired");
    expect(toRoomView(room, admin.id, 30_101).participants.find((team) => team.id === challenger.id)?.squad).toHaveLength(0);
  });

  it("force-closes an open transfer window when the host ends the game", () => {
    const admin = participant("admin", "Alpha Eleven", "#56e0c4");
    const room = createRoomState("7905", admin, 0);
    configureRoom(room, admin.id, "football", 500, "current", 1);
    startRoom(room, admin.id, 2);
    openTransferWindow(room, admin.id, 60, 10);
    stopRoom(room, admin.id, 20);
    expect(room.phase).toBe("complete");
    expect(room.transferWindow.status).toBe("closed");
    expect(room.pausedAt).toBeNull();
  });

  it("orders cricket as ten batters, seven pacers, three spinners, then all-rounders", () => {
    const queue = buildAuctionQueue("cricket", "current");
    const athletes = queue.map((id) => athleteCatalog.find((athlete) => athlete.id === id)!);
    const lower = (value: string | undefined) => value?.toLowerCase() ?? "";

    expect(new Set(queue).size).toBe(queue.length);
    expect(athletes.slice(0, 10).every((athlete) => lower(athlete.role).includes("batter"))).toBe(true);
    expect(athletes.slice(10, 17).every((athlete) => lower(athlete.role).includes("fast bowler"))).toBe(true);
    expect(athletes.slice(17, 20).every((athlete) => lower(athlete.role).includes("spin bowler"))).toBe(true);
    expect(athletes.slice(20, 24).every((athlete) => lower(athlete.role).includes("all-rounder"))).toBe(true);
  });

  it("builds isolated current, legends, and mixed player pools", () => {
    const current = buildAuctionQueue("football", "current");
    const legends = buildAuctionQueue("football", "legends");
    const mixed = buildAuctionQueue("football", "mixed");
    const athlete = (id: string) => athleteCatalog.find((candidate) => candidate.id === id)!;

    expect(current.every((id) => athlete(id).era === "current")).toBe(true);
    expect(legends.every((id) => athlete(id).era === "legend")).toBe(true);
    expect(current.length).toBeGreaterThanOrEqual(300);
    expect(legends.length).toBeGreaterThanOrEqual(300);
    expect(mixed.length).toBe(current.length + legends.length);
    expect(new Set(mixed).size).toBe(mixed.length);
  });

  it("keeps at least 300 athletes in every sport and era", () => {
    for (const sport of ["cricket", "football"] as const) {
      for (const era of ["current", "legend"] as const) {
        const athletes = athleteCatalog.filter((athlete) => athlete.sport === sport && athlete.era === era);
        expect(athletes.length).toBeGreaterThanOrEqual(300);
        expect(new Set(athletes.map((athlete) => athlete.id)).size).toBe(athletes.length);
      }
    }
  });
});
