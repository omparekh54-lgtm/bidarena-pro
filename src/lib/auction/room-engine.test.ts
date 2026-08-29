import { describe, expect, it } from "vitest";
import { AuctionError } from "./errors";
import {
  BID_WINDOW_MS,
  REVEAL_WINDOW_MS,
  RESULT_WINDOW_MS,
  addParticipant,
  bidForParticipant,
  configureRoom,
  createRoomState,
  settleRoom,
  startRoom,
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
    configureRoom(room, admin.id, "football", 2);
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
    configureRoom(room, admin.id, "cricket", 2);
    startRoom(room, admin.id, 10);
    settleRoom(room, 10 + REVEAL_WINDOW_MS);
    bidForParticipant(room, winner.id, 4_000);
    const closingTime = Date.parse(room.deadlineAt!);

    settleRoom(room, closingTime);
    expect(room.phase).toBe("sold");
    expect(room.sales).toHaveLength(1);
    expect(room.sales[0].participantId).toBe(winner.id);
    expect(winner.squad).toHaveLength(1);
    expect(winner.budget).toBe(1200 - room.sales[0].amount);

    settleRoom(room, closingTime + RESULT_WINDOW_MS);
    expect(room.phase).toBe("reveal");
    expect(room.lotIndex).toBe(1);
  });

  it("marks a player unsold when the ten-second window expires without a bid", () => {
    const admin = participant("admin", "Alpha Eleven", "#56e0c4");
    const room = createRoomState("3456", admin, 0);
    configureRoom(room, admin.id, "football", 1);
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
    expect(() => configureRoom(room, "attacker", "cricket", 1)).toThrowError(AuctionError);
    expect(room.sport).toBeNull();
  });
});

