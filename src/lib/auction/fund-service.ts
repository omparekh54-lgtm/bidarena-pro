import { createHash, timingSafeEqual } from "node:crypto";
import { assertAuction } from "./errors";
import { mutateStoredRoom } from "./room-store";
import { settleRoom, toRoomView } from "./room-engine";
import type { AuctionRoom } from "./types";

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function authenticate(room: AuctionRoom, playerId: string, token: string) {
  const participant = room.participants.find((candidate) => candidate.id === playerId);
  assertAuction(participant && token, "Your room session is invalid. Join the room again.", 401, "INVALID_SESSION");
  const expected = Buffer.from(participant.tokenHash, "hex");
  const actual = Buffer.from(tokenHash(token), "hex");
  assertAuction(expected.length === actual.length && timingSafeEqual(expected, actual), "Your room session is invalid. Join the room again.", 401, "INVALID_SESSION");
  return participant;
}

export async function addFundsToEveryTeam(code: string, playerId: string, token: string, amount: number) {
  assertAuction(/^\d{4}$/.test(code), "Enter the four-digit room code.", 422, "INVALID_ROOM_CODE");
  assertAuction(Number.isInteger(amount) && amount > 0 && amount <= 100_000, "Choose a valid positive top-up amount.", 422, "INVALID_TOP_UP");

  const result = await mutateStoredRoom(code, (room) => {
    authenticate(room, playerId, token);
    settleRoom(room);
    assertAuction(room.adminPlayerId === playerId, "Only the administrator can add funds.", 403, "ADMIN_ONLY");
    assertAuction(room.phase !== "lobby" && room.phase !== "complete", "Funds can only be added during a running game.", 409, "TOP_UP_UNAVAILABLE");

    for (const participant of room.participants) {
      participant.budget += amount;
      participant.initialBudget += amount;
    }
    room.updatedAt = new Date().toISOString();
    room.version += 1;
  });

  return toRoomView(result.room, playerId);
}
