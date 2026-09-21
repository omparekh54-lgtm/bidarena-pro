import { createHash, timingSafeEqual } from "node:crypto";
import { athleteCatalog } from "@/data/catalog";
import { assertAuction } from "./errors";
import { finalizeRoomResult, toRoomView } from "./room-engine";
import { mutateStoredRoom, writeFinalResult } from "./room-store";
import { startTournamentRound as resolveTournamentRound } from "./tournament-engine";
import type { AuctionRoom, CricketLineup, FootballLineup, RoomView, TournamentEvent, TournamentFixture } from "./types";

export const ROUND_COUNTDOWN_MS = 5_000;
const athleteById = new Map(athleteCatalog.map((athlete) => [athlete.id, athlete]));
const FOOTBALL_SLOTS = ["GK", "LB", "CB1", "CB2", "RB", "CM1", "CM2", "CM3", "LW", "ST", "RW"];

function iso(now = Date.now()) { return new Date(now).toISOString(); }
function tokenHash(token: string) { return createHash("sha256").update(token).digest("hex"); }

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

function choosePlayer(ids: string[]) {
  return [...ids].sort((a, b) => (athleteById.get(b)?.gameRating ?? 70) - (athleteById.get(a)?.gameRating ?? 70))[0];
}

function availablePlayers(room: AuctionRoom, participantId: string) {
  const participant = room.participants.find((candidate) => candidate.id === participantId);
  if (!participant) return [];
  return [...participant.squad]
    .sort((a, b) => (athleteById.get(b.athleteId)?.gameRating ?? 70) - (athleteById.get(a.athleteId)?.gameRating ?? 70))
    .map((entry) => entry.athleteId);
}

function safeFootballLineup(room: AuctionRoom, participantId: string): FootballLineup {
  const chosen = availablePlayers(room, participantId).slice(0, 11);
  return {
    formation: "4-3-3",
    starterIds: chosen,
    slotAssignments: Object.fromEntries(FOOTBALL_SLOTS.slice(0, chosen.length).map((slot, index) => [slot, chosen[index]])),
    substituteIds: availablePlayers(room, participantId).filter((id) => !chosen.includes(id)).slice(0, 7),
  };
}

function safeCricketLineup(room: AuctionRoom, participantId: string): CricketLineup {
  const playingXi = availablePlayers(room, participantId).slice(0, 11);
  const bowlers = playingXi.filter((id) => /bowler|all-rounder/i.test(athleteById.get(id)?.role ?? ""));
  const pool = bowlers.length ? bowlers : playingXi;
  const overs = room.tournament.cricketOvers;
  const bowlingPlan = Array.from({ length: overs }, (_, index) => pool.length ? pool[index % pool.length] : "");
  return { playingXi, battingOrder: [...playingXi], bowlingPlan: bowlingPlan.filter(Boolean) };
}

function repairRoundLineups(room: AuctionRoom, fixtures: TournamentFixture[]) {
  for (const fixture of fixtures) {
    if (room.sport === "football") {
      fixture.footballLineups ??= {};
      const home = fixture.footballLineups[fixture.homeParticipantId];
      const away = fixture.footballLineups[fixture.awayParticipantId];
      const valid = (lineup: FootballLineup | undefined, participantId: string) => {
        const owned = new Set(availablePlayers(room, participantId));
        return Boolean(lineup) && lineup!.starterIds.every((id) => owned.has(id)) && Object.values(lineup!.slotAssignments).every((id) => lineup!.starterIds.includes(id));
      };
      if (!valid(home, fixture.homeParticipantId)) fixture.footballLineups[fixture.homeParticipantId] = safeFootballLineup(room, fixture.homeParticipantId);
      if (!valid(away, fixture.awayParticipantId)) fixture.footballLineups[fixture.awayParticipantId] = safeFootballLineup(room, fixture.awayParticipantId);
    } else {
      fixture.cricketLineups ??= {};
      const home = fixture.cricketLineups[fixture.homeParticipantId];
      const away = fixture.cricketLineups[fixture.awayParticipantId];
      const valid = (lineup: CricketLineup | undefined, participantId: string) => {
        const owned = new Set(availablePlayers(room, participantId));
        return Boolean(lineup) && lineup!.playingXi.every((id) => owned.has(id)) && lineup!.battingOrder.every((id) => lineup!.playingXi.includes(id)) && lineup!.bowlingPlan.length === room.tournament.cricketOvers && lineup!.bowlingPlan.every((id) => lineup!.playingXi.includes(id));
      };
      if (!valid(home, fixture.homeParticipantId)) fixture.cricketLineups[fixture.homeParticipantId] = safeCricketLineup(room, fixture.homeParticipantId);
      if (!valid(away, fixture.awayParticipantId)) fixture.cricketLineups[fixture.awayParticipantId] = safeCricketLineup(room, fixture.awayParticipantId);
      fixture.toss ??= { calls: {} };
      if (!fixture.toss.winnerParticipantId) {
        fixture.toss.coin = crypto.getRandomValues(new Uint8Array(1))[0] % 2 === 0 ? "heads" : "tails";
        fixture.toss.calls[fixture.homeParticipantId] ??= "heads";
        fixture.toss.calls[fixture.awayParticipantId] ??= "tails";
        fixture.toss.winnerParticipantId = fixture.toss.calls[fixture.homeParticipantId] === fixture.toss.coin ? fixture.homeParticipantId : fixture.awayParticipantId;
      }
      fixture.toss.decision ??= "bat";
    }
    fixture.status = "ready";
  }
}

function decorateFootballResult(room: AuctionRoom, fixture: TournamentFixture) {
  if (!fixture.result) return;
  const events: TournamentEvent[] = [];
  const lineups = fixture.footballLineups ?? {};
  const addGoals = (participantId: string, count: number, side: "home" | "away") => {
    const lineup = lineups[participantId];
    if (!lineup) return;
    const candidates = lineup.starterIds.filter((id) => /forward|striker|winger|attacker|midfield/i.test(athleteById.get(id)?.role ?? ""));
    const pool = candidates.length ? candidates : lineup.starterIds;
    for (let index = 0; index < count; index += 1) {
      const athleteId = pool[index % Math.max(1, pool.length)];
      if (!athleteId) continue;
      events.push({ id: `${fixture.id}-${side}-goal-${index}`, type: "goal", minute: 8 + ((index * 17 + (side === "away" ? 11 : 0)) % 82), participantId, athleteId, label: `Goal · ${athleteById.get(athleteId)?.shortName ?? "Player"}` });
    }
  };
  addGoals(fixture.homeParticipantId, fixture.result.homeScore, "home");
  addGoals(fixture.awayParticipantId, fixture.result.awayScore, "away");
  fixture.result.events = events.sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0));
  const winningParticipantId = fixture.result.homeScore >= fixture.result.awayScore ? fixture.homeParticipantId : fixture.awayParticipantId;
  const winnerLineup = lineups[winningParticipantId];
  fixture.result.playerOfMatchAthleteId = winnerLineup ? choosePlayer(winnerLineup.starterIds) : undefined;
}

function decorateCricketResult(room: AuctionRoom, fixture: TournamentFixture) {
  if (!fixture.result) return;
  const events: TournamentEvent[] = [];
  const lineups = fixture.cricketLineups ?? {};
  for (const [side, participantId, score, wickets] of [
    ["home", fixture.homeParticipantId, fixture.result.homeScore, fixture.result.homeAllOut ? 10 : 0],
    ["away", fixture.awayParticipantId, fixture.result.awayScore, fixture.result.awayAllOut ? 10 : 0],
  ] as const) {
    const lineup = lineups[participantId];
    if (!lineup) continue;
    const batterId = choosePlayer(lineup.battingOrder);
    if (batterId) {
      const topRuns = Math.min(Math.max(0, score), Math.max(1, Math.round(score * 0.42)));
      events.push({ id: `${fixture.id}-${side}-top-batter`, type: "top-scorer", participantId, athleteId: batterId, label: `Top scorer · ${athleteById.get(batterId)?.shortName ?? "Player"} ${topRuns} runs` });
    }
    const bowlerId = choosePlayer(lineup.playingXi.filter((id) => /bowler|all-rounder/i.test(athleteById.get(id)?.role ?? ""))) ?? choosePlayer(lineup.playingXi);
    if (bowlerId) {
      const wicketsTaken = wickets || Math.min(4, Math.max(1, Math.round((100 - (athleteById.get(bowlerId)?.gameRating ?? 70)) / 12)));
      events.push({ id: `${fixture.id}-${side}-top-bowler`, participantId, athleteId: bowlerId, type: "top-bowler", label: `Top bowler · ${athleteById.get(bowlerId)?.shortName ?? "Player"} ${wicketsTaken} wickets` });
    }
  }
  fixture.result.events = events;
  const winnerId = fixture.result.homeScore >= fixture.result.awayScore ? fixture.homeParticipantId : fixture.awayParticipantId;
  const winnerLineup = lineups[winnerId];
  fixture.result.playerOfMatchAthleteId = winnerLineup ? choosePlayer(winnerLineup.battingOrder) : undefined;
}

function decorateRoundResults(room: AuctionRoom, round: number) {
  room.tournament.fixtures.filter((fixture) => fixture.round === round && fixture.status === "complete").forEach((fixture) => {
    if (room.sport === "football") decorateFootballResult(room, fixture);
    else decorateCricketResult(room, fixture);
  });
}

export function startTournamentRoundWithCountdown(room: AuctionRoom, adminPlayerId: string, now = Date.now()) {
  const isAdmin = room.adminPlayerId === adminPlayerId;
  assertAuction(room.phase === "tournament" && room.tournament.status === "active", "The tournament is not active.", 409, "TOURNAMENT_INACTIVE");
  if (room.tournament.roundPhase === "results" && room.tournament.lastCompletedRound === room.tournament.currentRound) return;
  const fixtures = room.tournament.fixtures.filter((fixture) => fixture.round === room.tournament.currentRound);
  assertAuction(fixtures.length > 0, "There are no fixtures in this round.", 409, "ROUND_EMPTY");

  const countdownEndsAt = room.tournament.roundCountdownEndsAt ? Date.parse(room.tournament.roundCountdownEndsAt) : 0;
  if (room.tournament.roundPhase === "countdown" && countdownEndsAt > now) return;

  if (room.tournament.roundPhase !== "countdown") {
    assertAuction(isAdmin, "Only the administrator can start the round countdown.", 403, "ADMIN_ONLY");
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
  repairRoundLineups(room, fixtures);
  touch(room, now);

  resolveTournamentRound(room, room.adminPlayerId, now);
  decorateRoundResults(room, playedRound);
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
    if (room.phase === "complete" && room.sport && room.purse) await writeFinalResult(finalizeRoomResult(room));
  });
  return toRoomView(result.room, playerId);
}

export function isRoundCountdownActive(room: AuctionRoom, now = Date.now()) {
  return room.tournament.roundPhase === "countdown" && Boolean(room.tournament.roundCountdownEndsAt) && Date.parse(room.tournament.roundCountdownEndsAt!) > now;
}
