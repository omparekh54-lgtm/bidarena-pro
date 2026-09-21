import { assertAuction } from "./errors";
import { startTournamentRound as resolveTournamentRound } from "./tournament-engine";
import type { AuctionRoom } from "./types";

export const ROUND_COUNTDOWN_MS = 5_000;

function iso(now = Date.now()) {
  return new Date(now).toISOString();
}

function touch(room: AuctionRoom, now = Date.now()) {
  room.updatedAt = iso(now);
  room.version += 1;
}

/**
 * Starts a synchronized five-second round countdown. A second call by the host
 * after the countdown resolves the round using the existing tournament engine.
 * This keeps the existing match simulation and progression logic intact.
 */
export function startTournamentRoundWithCountdown(room: AuctionRoom, adminPlayerId: string, now = Date.now()) {
  assertAuction(room.adminPlayerId === adminPlayerId, "Only the administrator can start the round.", 403, "ADMIN_ONLY");
  assertAuction(room.phase === "tournament" && room.tournament.status === "active", "The tournament is not active.", 409, "TOURNAMENT_INACTIVE");

  const fixtures = room.tournament.fixtures.filter((fixture) => fixture.round === room.tournament.currentRound);
  assertAuction(fixtures.length > 0, "There are no fixtures in this round.", 409, "ROUND_EMPTY");

  const countdownEndsAt = room.tournament.roundCountdownEndsAt ? Date.parse(room.tournament.roundCountdownEndsAt) : 0;

  if (room.tournament.roundPhase === "countdown" && countdownEndsAt > now) {
    return;
  }

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
  room.tournament.roundPhase = room.tournament.status === "complete" ? "results" : "results";
  touch(room, now);
}

export function isRoundCountdownActive(room: AuctionRoom, now = Date.now()) {
  return room.tournament.roundPhase === "countdown" && Boolean(room.tournament.roundCountdownEndsAt) && Date.parse(room.tournament.roundCountdownEndsAt!) > now;
}
