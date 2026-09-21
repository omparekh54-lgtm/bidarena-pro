import { createHash, timingSafeEqual } from "node:crypto";
import { assertAuction } from "./errors";
import { finalizeRoomResult } from "./room-engine";
import { mutateStoredRoom, writeFinalResult } from "./room-store";
import { startTournamentRound as resolveTournamentRound } from "./tournament-engine";
import type { AuctionRoom, RoomView } from "./types";
import { toRoomView } from "./room-engine";

export const ROUND_COUNTDOWN_MS = 5_000;

function iso(now = Date.now()) {
  return new Date(now).toISOString();
}

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

function touch(room: AuctionRoom, now = Date.now()) {
  room.updatedAt = iso(now);
  room.version += 1;
}

/**
 * Starts a synchronized five-second round countdown. A second host call after
 * the countdown resolves the round through the existing simulation engine.
 */
export function startTournamentRoundWithCountdown(room: AuctionRoom, adminPlayerId: string, now = Date.now()) {
  assertAuction(room.adminPlayerId === adminPlayerId, "Only the administrator can start the round.", 403, "ADMIN_ONLY");
  assertAuction(room.phase === "tournament" && room.tournament.status === "active", "The tournament is not active.", 409, "TOURNAMENT_INACTIVE");

  const fixtures = room.tournament.fixtures.filter((fixture) => fixture.round === room.tournament.currentRound);
  assertAuction(fixtures.length > 0, "There are no fixtures in this round.", 409, "ROUND_EMPTY");

  const countdownEndsAt = room.tournament.roundCountdownEndsAt ? Date.parse(room.tournament.roundCountdownEndsAt) : 0;

  if (room.tournament.roundPhase === "countdown" && countdownEndsAt > now) return;

  if (room.tournament.roundPhase !== "countdown") {
    room.tournament.roundPhase = "countdown";
    room.tournament.roundCountdownEndsAt = iso(now + ROUND_COUNTDOWN_MS);
    room.tournament.roundStartedAt = undefined;
    touch(room, now);
    return;
  }

  assertAuction(countdownEndsAt <= now, "The round countdown is still running.", 409, "ROUND_COUNTDOWN_ACTIVE");

  const playedRound = room.tournament.currentRound;
  room.tournament.roundPhase = "live";
  room.tournament.roundCountdownEndsAt = undefined;
  room.tournament.roundStartedAt = iso(now);
  touch(room, now);

  resolveTournamentRound(room, adminPlayerId, now);

  room.tournament.lastCompletedRound = playedRound;
  room.tournament.roundCompletedAt = iso(now);
  room.tournament.roundPhase = "results";
  touch(room, now);
}

export async function startTournamentRound(code: string, playerId: string, token: string, expectedRound?: number): Promise<RoomView> {
  assertAuction(/^\d{4}$/.test(code), "Enter the four-digit room code.", 422, "INVALID_ROOM_CODE");
  const result = await mutateStoredRoom(code, async (room) => {
    authenticate(room, playerId, token);
    if (expectedRound !== undefined) {
      assertAuction(room.tournament.currentRound === expectedRound, "That tournament round has already advanced. Refreshing the latest game state.", 409, "STALE_TOURNAMENT_ROUND");
    }
    startTournamentRoundWithCountdown(room, playerId);
    if (room.phase === "complete" && room.sport && room.purse) {
      await writeFinalResult(finalizeRoomResult(room));
    }
  });
  return toRoomView(result.room, playerId);
}

export function isRoundCountdownActive(room: AuctionRoom, now = Date.now()) {
  return room.tournament.roundPhase === "countdown" && Boolean(room.tournament.roundCountdownEndsAt) && Date.parse(room.tournament.roundCountdownEndsAt!) > now;
}
