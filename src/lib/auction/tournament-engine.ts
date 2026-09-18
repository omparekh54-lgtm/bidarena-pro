import { athleteCatalog } from "@/data/catalog";
import { assertAuction } from "./errors";
import type {
  AuctionRoom,
  CricketLineup,
  FootballLineup,
  StandingRow,
  TournamentFixture,
  TournamentFormat,
} from "./types";

const athleteById = new Map(athleteCatalog.map((athlete) => [athlete.id, athlete]));

function iso(now = Date.now()) {
  return new Date(now).toISOString();
}

function touch(room: AuctionRoom, now = Date.now()) {
  room.updatedAt = iso(now);
  room.version += 1;
}

function fixtureId(round: number, home: string, away: string) {
  return `r${round}-${home.slice(0, 6)}-${away.slice(0, 6)}-${crypto.randomUUID().slice(0, 6)}`;
}

function blankStandings(room: AuctionRoom): StandingRow[] {
  return room.participants.map((participant) => ({
    participantId: participant.id,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    points: 0,
    scored: 0,
    conceded: 0,
    difference: 0,
  }));
}

function roundRobin(participantIds: string[]) {
  const ids = [...participantIds];
  if (ids.length % 2) ids.push("__bye__");
  const rounds: TournamentFixture[] = [];
  const count = ids.length;
  for (let round = 0; round < count - 1; round += 1) {
    for (let pair = 0; pair < count / 2; pair += 1) {
      const home = ids[pair];
      const away = ids[count - 1 - pair];
      if (home !== "__bye__" && away !== "__bye__") {
        rounds.push({
          id: fixtureId(round + 1, home, away),
          round: round + 1,
          stage: "league",
          homeParticipantId: round % 2 === 0 ? home : away,
          awayParticipantId: round % 2 === 0 ? away : home,
          status: "scheduled",
          footballLineups: {},
          cricketLineups: {},
          toss: { calls: {} },
        });
      }
    }
    ids.splice(1, 0, ids.pop()!);
  }
  return rounds;
}

function initialKnockout(participantIds: string[]) {
  const ids = [...participantIds];
  const targetBracketSize = 2 ** Math.floor(Math.log2(ids.length));
  const preliminaryMatches = ids.length === targetBracketSize ? ids.length / 2 : ids.length - targetBracketSize;
  const fixtures: TournamentFixture[] = [];
  for (let index = 0; index < preliminaryMatches; index += 1) {
    const home = ids[index * 2];
    const away = ids[index * 2 + 1];
    fixtures.push({
      id: fixtureId(1, home, away),
      round: 1,
      stage: "knockout",
      homeParticipantId: home,
      awayParticipantId: away,
      status: "scheduled",
      footballLineups: {},
      cricketLineups: {},
      toss: { calls: {} },
    });
  }
  return fixtures;
}

export function setupTournament(room: AuctionRoom, adminPlayerId: string, format: TournamentFormat, cricketOvers: 10 | 20 | 50, now = Date.now()) {
  assertAuction(room.adminPlayerId === adminPlayerId, "Only the administrator can configure the tournament.", 403, "ADMIN_ONLY");
  assertAuction(room.phase === "tournament-setup", "Tournament setup is not available right now.", 409, "TOURNAMENT_SETUP_UNAVAILABLE");
  assertAuction(room.participants.length >= 2, "At least two teams are required for a tournament.", 422, "TOURNAMENT_TEAMS_REQUIRED");

  const ids = room.participants.map((participant) => participant.id);
  let fixtures = format === "knockout" ? initialKnockout(ids) : roundRobin(ids);

  if (format === "groups-knockout") {
    const midpoint = Math.ceil(ids.length / 2);
    const groupA = roundRobin(ids.slice(0, midpoint)).map((fixture) => ({ ...fixture, stage: "group" as const }));
    const groupB = roundRobin(ids.slice(midpoint)).map((fixture) => ({ ...fixture, stage: "group" as const }));
    fixtures = [...groupA, ...groupB];
  }

  room.tournament = {
    status: "active",
    format,
    cricketOvers,
    currentRound: 1,
    fixtures,
    standings: blankStandings(room),
    startedAt: iso(now),
  };
  room.phase = "tournament";
  room.pausedAt = null;
  room.sessionResume.endedAt = null;
  room.sessionResume.requestedAt = null;
  room.sessionResume.votes = [];
  touch(room, now);
}

function fixtureFor(room: AuctionRoom, fixtureIdValue: string) {
  const fixture = room.tournament.fixtures.find((candidate) => candidate.id === fixtureIdValue);
  assertAuction(fixture, "That fixture does not exist.", 404, "FIXTURE_NOT_FOUND");
  return fixture;
}

function assertOwnFixture(fixture: TournamentFixture, participantId: string) {
  assertAuction(
    fixture.homeParticipantId === participantId || fixture.awayParticipantId === participantId,
    "Your team is not part of this fixture.",
    403,
    "FIXTURE_FORBIDDEN",
  );
}

export function submitFootballLineup(room: AuctionRoom, participantId: string, fixtureIdValue: string, lineup: FootballLineup, now = Date.now()) {
  assertAuction(room.sport === "football", "This room is not a football tournament.", 409, "WRONG_SPORT");
  const fixture = fixtureFor(room, fixtureIdValue);
  assertOwnFixture(fixture, participantId);
  assertAuction(fixture.status !== "complete", "This fixture is already complete.", 409, "MATCH_COMPLETE");
  const participant = room.participants.find((candidate) => candidate.id === participantId)!;
  const owned = new Set(participant.squad.map((entry) => entry.athleteId));
  const starters = [...new Set(lineup.starterIds)];
  assertAuction(starters.length === 11, "Select exactly 11 starters.", 422, "INVALID_STARTING_XI");
  assertAuction(starters.every((id) => owned.has(id)), "Every starter must belong to your squad.", 422, "INVALID_STARTING_XI");
  assertAuction(Object.values(lineup.slotAssignments).every((id) => starters.includes(id)), "Position assignments must use your selected starters.", 422, "INVALID_POSITION_ASSIGNMENT");
  fixture.footballLineups ??= {};
  fixture.footballLineups[participantId] = { ...lineup, starterIds: starters };
  fixture.status = fixture.footballLineups[fixture.homeParticipantId] && fixture.footballLineups[fixture.awayParticipantId] ? "ready" : "scheduled";
  touch(room, now);
}

function cricketMaxOvers(totalOvers: number) {
  return Math.ceil(totalOvers / 5);
}

export function submitCricketLineup(room: AuctionRoom, participantId: string, fixtureIdValue: string, lineup: CricketLineup, now = Date.now()) {
  assertAuction(room.sport === "cricket", "This room is not a cricket tournament.", 409, "WRONG_SPORT");
  const fixture = fixtureFor(room, fixtureIdValue);
  assertOwnFixture(fixture, participantId);
  assertAuction(fixture.status !== "complete", "This fixture is already complete.", 409, "MATCH_COMPLETE");
  const participant = room.participants.find((candidate) => candidate.id === participantId)!;
  const owned = new Set(participant.squad.map((entry) => entry.athleteId));
  const xi = [...new Set(lineup.playingXi)];
  assertAuction(xi.length === 11, "Select exactly 11 players.", 422, "INVALID_PLAYING_XI");
  assertAuction(xi.every((id) => owned.has(id)), "Every player in the XI must belong to your squad.", 422, "INVALID_PLAYING_XI");
  assertAuction(lineup.battingOrder.length === 11 && new Set(lineup.battingOrder).size === 11 && lineup.battingOrder.every((id) => xi.includes(id)), "Batting order must contain all 11 selected players exactly once.", 422, "INVALID_BATTING_ORDER");
  assertAuction(lineup.bowlingPlan.length === room.tournament.cricketOvers, `Assign a bowler for each of the ${room.tournament.cricketOvers} overs.`, 422, "INVALID_BOWLING_PLAN");
  const counts = new Map<string, number>();
  lineup.bowlingPlan.forEach((id, index) => {
    assertAuction(xi.includes(id), `Over ${index + 1} must be assigned to a player in your XI.`, 422, "INVALID_BOWLING_PLAN");
    assertAuction(index === 0 || lineup.bowlingPlan[index - 1] !== id, "The same bowler cannot bowl consecutive overs.", 422, "INVALID_BOWLING_PLAN");
    counts.set(id, (counts.get(id) ?? 0) + 1);
  });
  const max = cricketMaxOvers(room.tournament.cricketOvers);
  assertAuction([...counts.values()].every((count) => count <= max), `A bowler can bowl a maximum of ${max} overs in this format.`, 422, "INVALID_BOWLING_PLAN");
  fixture.cricketLineups ??= {};
  fixture.cricketLineups[participantId] = lineup;
  const both = fixture.cricketLineups[fixture.homeParticipantId] && fixture.cricketLineups[fixture.awayParticipantId];
  const tossReady = Boolean(fixture.toss?.winnerParticipantId && fixture.toss.decision);
  fixture.status = both && tossReady ? "ready" : "scheduled";
  touch(room, now);
}

export function callToss(room: AuctionRoom, participantId: string, fixtureIdValue: string, requested: "heads" | "tails", now = Date.now()) {
  assertAuction(room.sport === "cricket", "Toss is only available for cricket.", 409, "WRONG_SPORT");
  const fixture = fixtureFor(room, fixtureIdValue);
  assertOwnFixture(fixture, participantId);
  fixture.toss ??= { calls: {} };
  assertAuction(!fixture.toss.calls[participantId], "You have already made your toss call.", 409, "TOSS_ALREADY_CALLED");
  const opponentId = fixture.homeParticipantId === participantId ? fixture.awayParticipantId : fixture.homeParticipantId;
  const opponentCall = fixture.toss.calls[opponentId];
  fixture.toss.calls[participantId] = opponentCall ? (opponentCall === "heads" ? "tails" : "heads") : requested;

  if (fixture.toss.calls[fixture.homeParticipantId] && fixture.toss.calls[fixture.awayParticipantId] && !fixture.toss.coin) {
    fixture.toss.coin = crypto.getRandomValues(new Uint8Array(1))[0] % 2 === 0 ? "heads" : "tails";
    fixture.toss.winnerParticipantId = fixture.toss.calls[fixture.homeParticipantId] === fixture.toss.coin
      ? fixture.homeParticipantId
      : fixture.awayParticipantId;
  }
  touch(room, now);
}

export function chooseTossDecision(room: AuctionRoom, participantId: string, fixtureIdValue: string, decision: "bat" | "bowl", now = Date.now()) {
  const fixture = fixtureFor(room, fixtureIdValue);
  assertAuction(fixture.toss?.winnerParticipantId === participantId, "Only the toss winner can choose to bat or bowl.", 403, "TOSS_DECISION_FORBIDDEN");
  fixture.toss.decision = decision;
  const both = fixture.cricketLineups?.[fixture.homeParticipantId] && fixture.cricketLineups?.[fixture.awayParticipantId];
  fixture.status = both ? "ready" : "scheduled";
  touch(room, now);
}

function rating(ids: string[]) {
  const values = ids.map((id) => athleteById.get(id)?.gameRating ?? 70);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 70;
}

function rand(maxExclusive: number) {
  return crypto.getRandomValues(new Uint32Array(1))[0] % maxExclusive;
}

function footballScore(teamRating: number, opponentRating: number) {
  const edge = Math.max(-1.2, Math.min(1.2, (teamRating - opponentRating) / 8));
  const chances = 1.3 + edge + rand(180) / 100;
  return Math.max(0, Math.min(6, Math.floor(chances)));
}

function cricketInnings(teamRating: number, opponentRating: number, overs: number) {
  const basePerOver = 6.4 + (teamRating - opponentRating) / 18;
  const runs = Math.max(45, Math.round(overs * (basePerOver + (rand(260) - 80) / 100)));
  const wickets = Math.min(10, Math.max(2, 3 + rand(7) + (opponentRating > teamRating ? 1 : 0)));
  return { runs, wickets };
}

function updateTable(room: AuctionRoom, fixture: TournamentFixture) {
  if (!fixture.result) return;
  const home = room.tournament.standings.find((row) => row.participantId === fixture.homeParticipantId)!;
  const away = room.tournament.standings.find((row) => row.participantId === fixture.awayParticipantId)!;
  home.played += 1; away.played += 1;
  home.scored += fixture.result.homeScore; home.conceded += fixture.result.awayScore;
  away.scored += fixture.result.awayScore; away.conceded += fixture.result.homeScore;
  if (fixture.result.homeScore > fixture.result.awayScore) {
    home.won += 1; away.lost += 1;
    home.points += room.sport === "football" ? 3 : 2;
  } else if (fixture.result.awayScore > fixture.result.homeScore) {
    away.won += 1; home.lost += 1;
    away.points += room.sport === "football" ? 3 : 2;
  } else {
    home.drawn += 1; away.drawn += 1;
    home.points += room.sport === "football" ? 1 : 1;
    away.points += room.sport === "football" ? 1 : 1;
  }
  home.difference = home.scored - home.conceded;
  away.difference = away.scored - away.conceded;
}

function simulateFixture(room: AuctionRoom, fixture: TournamentFixture) {
  if (room.sport === "football") {
    const homeLineup = fixture.footballLineups?.[fixture.homeParticipantId]!;
    const awayLineup = fixture.footballLineups?.[fixture.awayParticipantId]!;
    const homeRating = rating(homeLineup.starterIds);
    const awayRating = rating(awayLineup.starterIds);
    let homeScore = footballScore(homeRating, awayRating);
    let awayScore = footballScore(awayRating, homeRating);
    if (fixture.stage !== "league" && fixture.stage !== "group" && homeScore === awayScore) {
      if (rand(2) === 0) homeScore += 1; else awayScore += 1;
    }
    fixture.result = {
      homeScore,
      awayScore,
      summary: `${homeScore}-${awayScore}`,
      homeDetail: `${homeLineup.formation} · XI avg ${homeRating.toFixed(1)}`,
      awayDetail: `${awayLineup.formation} · XI avg ${awayRating.toFixed(1)}`,
    };
  } else {
    const homeLineup = fixture.cricketLineups?.[fixture.homeParticipantId]!;
    const awayLineup = fixture.cricketLineups?.[fixture.awayParticipantId]!;
    const homeRating = rating(homeLineup.playingXi);
    const awayRating = rating(awayLineup.playingXi);
    const tossWinner = fixture.toss!.winnerParticipantId!;
    const decision = fixture.toss!.decision!;
    const firstBat = decision === "bat" ? tossWinner : (tossWinner === fixture.homeParticipantId ? fixture.awayParticipantId : fixture.homeParticipantId);
    const secondBat = firstBat === fixture.homeParticipantId ? fixture.awayParticipantId : fixture.homeParticipantId;
    const firstRating = firstBat === fixture.homeParticipantId ? homeRating : awayRating;
    const secondRating = secondBat === fixture.homeParticipantId ? homeRating : awayRating;
    const first = cricketInnings(firstRating, secondRating, room.tournament.cricketOvers);
    let second = cricketInnings(secondRating, firstRating, room.tournament.cricketOvers);
    if (second.runs === first.runs) second = { ...second, runs: second.runs + (rand(2) === 0 ? 1 : -1) };
    const homeInnings = firstBat === fixture.homeParticipantId ? first : second;
    const awayInnings = firstBat === fixture.awayParticipantId ? first : second;
    const homeScore = homeInnings.runs;
    const awayScore = awayInnings.runs;
    const winner = homeScore > awayScore ? fixture.homeParticipantId : fixture.awayParticipantId;
    const winningInnings = winner === fixture.homeParticipantId ? homeInnings : awayInnings;
    const losingInnings = winner === fixture.homeParticipantId ? awayInnings : homeInnings;
    const chasingWinner = winner === secondBat;
    const summary = chasingWinner
      ? `${room.participants.find((p) => p.id === winner)?.teamName} won by ${10 - winningInnings.wickets} wickets`
      : `${room.participants.find((p) => p.id === winner)?.teamName} won by ${Math.abs(winningInnings.runs - losingInnings.runs)} runs`;
    fixture.result = {
      homeScore,
      awayScore,
      summary,
      homeDetail: `${homeInnings.runs}/${homeInnings.wickets} (${room.tournament.cricketOvers} ov)`,
      awayDetail: `${awayInnings.runs}/${awayInnings.wickets} (${room.tournament.cricketOvers} ov)`,
    };
  }
  fixture.status = "complete";
  updateTable(room, fixture);
}

function appendLeagueKnockout(room: AuctionRoom) {
  const format = room.tournament.format;
  if (format !== "league-knockout" && format !== "groups-knockout") return false;
  const hasKnockouts = room.tournament.fixtures.some((fixture) => fixture.stage === "semifinal" || fixture.stage === "final");
  if (hasKnockouts) return false;
  const leagueFixtures = room.tournament.fixtures.filter((fixture) => fixture.stage === "league" || fixture.stage === "group");
  if (leagueFixtures.some((fixture) => fixture.status !== "complete")) return false;
  const ranked = [...room.tournament.standings].sort((a, b) => b.points - a.points || b.difference - a.difference || b.scored - a.scored);
  const top = ranked.slice(0, 4);
  if (top.length < 4) return false;
  const nextRound = Math.max(...room.tournament.fixtures.map((fixture) => fixture.round)) + 1;
  room.tournament.fixtures.push(
    {
      id: fixtureId(nextRound, top[0].participantId, top[3].participantId),
      round: nextRound,
      stage: "semifinal",
      homeParticipantId: top[0].participantId,
      awayParticipantId: top[3].participantId,
      status: "scheduled",
      footballLineups: {},
      cricketLineups: {},
      toss: { calls: {} },
    },
    {
      id: fixtureId(nextRound, top[1].participantId, top[2].participantId),
      round: nextRound,
      stage: "semifinal",
      homeParticipantId: top[1].participantId,
      awayParticipantId: top[2].participantId,
      status: "scheduled",
      footballLineups: {},
      cricketLineups: {},
      toss: { calls: {} },
    },
  );
  room.tournament.currentRound = nextRound;
  return true;
}

function progressKnockout(room: AuctionRoom) {
  const roundFixtures = room.tournament.fixtures.filter((fixture) => fixture.round === room.tournament.currentRound);
  if (!roundFixtures.length || roundFixtures.some((fixture) => fixture.status !== "complete")) return;
  const knockoutRound = roundFixtures.every((fixture) => fixture.stage !== "league" && fixture.stage !== "group");
  if (!knockoutRound) return;
  let winners = roundFixtures.map((fixture) => fixture.result!.homeScore > fixture.result!.awayScore ? fixture.homeParticipantId : fixture.awayParticipantId);
  if (room.tournament.format === "knockout" && room.tournament.currentRound === 1) {
    const played = new Set(roundFixtures.flatMap((fixture) => [fixture.homeParticipantId, fixture.awayParticipantId]));
    winners = [...winners, ...room.participants.map((participant) => participant.id).filter((id) => !played.has(id))];
  }
  if (winners.length === 1) {
    room.tournament.status = "complete";
    room.tournament.championParticipantId = winners[0];
    room.tournament.completedAt = iso();
    room.phase = "complete";
    return;
  }
  const nextRound = room.tournament.currentRound + 1;
  const stage = winners.length === 2 ? "final" : winners.length <= 4 ? "semifinal" : "knockout";
  for (let i = 0; i < winners.length; i += 2) {
    if (!winners[i + 1]) continue;
    room.tournament.fixtures.push({
      id: fixtureId(nextRound, winners[i], winners[i + 1]),
      round: nextRound,
      stage,
      homeParticipantId: winners[i],
      awayParticipantId: winners[i + 1],
      status: "scheduled",
      footballLineups: {},
      cricketLineups: {},
      toss: { calls: {} },
    });
  }
  room.tournament.currentRound = nextRound;
}

export function startTournamentRound(room: AuctionRoom, adminPlayerId: string, now = Date.now()) {
  assertAuction(room.adminPlayerId === adminPlayerId, "Only the administrator can start the round.", 403, "ADMIN_ONLY");
  assertAuction(room.phase === "tournament" && room.tournament.status === "active", "The tournament is not active.", 409, "TOURNAMENT_INACTIVE");
  const fixtures = room.tournament.fixtures.filter((fixture) => fixture.round === room.tournament.currentRound);
  assertAuction(fixtures.length > 0, "There are no fixtures in this round.", 409, "ROUND_EMPTY");
  assertAuction(fixtures.every((fixture) => fixture.status === "ready"), "Every match in the round must be ready before starting.", 409, "ROUND_NOT_READY");
  fixtures.forEach((fixture) => simulateFixture(room, fixture));

  if (appendLeagueKnockout(room)) {
    touch(room, now);
    return;
  }

  const remaining = room.tournament.fixtures.some((fixture) => fixture.status !== "complete");
  if (!remaining) {
    if (room.tournament.format === "league") {
      const winner = [...room.tournament.standings].sort((a, b) => b.points - a.points || b.difference - a.difference || b.scored - a.scored)[0];
      room.tournament.status = "complete";
      room.tournament.championParticipantId = winner?.participantId;
      room.tournament.completedAt = iso(now);
      room.phase = "complete";
    } else {
      progressKnockout(room);
    }
  } else {
    const laterRound = Math.min(...room.tournament.fixtures.filter((fixture) => fixture.status !== "complete").map((fixture) => fixture.round));
    room.tournament.currentRound = laterRound;
    progressKnockout(room);
  }
  touch(room, now);
}
