import { athleteCatalog } from "@/data/catalog";
import { canBid, nextBidAmount, secureShuffle } from "./engine";
import { assertAuction } from "./errors";
import type { Athlete, AuctionRoom, ParticipantView, RoomParticipant, RoomView, Sport } from "./types";

export const BID_WINDOW_MS = 10_000;
export const REVEAL_WINDOW_MS = 3_200;
export const RESULT_WINDOW_MS = 2_400;
export const MAX_PLAYERS = 10;

const athleteById = new Map(athleteCatalog.map((athlete) => [athlete.id, athlete]));

function toIso(timestamp: number) {
  return new Date(timestamp).toISOString();
}

function touch(room: AuctionRoom, now: number) {
  room.updatedAt = toIso(now);
  room.version += 1;
}

function currentAthlete(room: AuctionRoom): Athlete | null {
  const athleteId = room.queue[room.lotIndex];
  return athleteId ? athleteById.get(athleteId) ?? null : null;
}

export function createRoomState(code: string, admin: RoomParticipant, now = Date.now()): AuctionRoom {
  const createdAt = toIso(now);
  return {
    schemaVersion: 1,
    code,
    adminPlayerId: admin.id,
    sport: null,
    phase: "lobby",
    queue: [],
    lotIndex: 0,
    currentBid: 0,
    leaderId: null,
    deadlineAt: null,
    transitionAt: null,
    participants: [admin],
    bids: [],
    sales: [],
    unsoldAthleteIds: [],
    createdAt,
    updatedAt: createdAt,
    version: 1,
  };
}

export function addParticipant(room: AuctionRoom, participant: RoomParticipant, now = Date.now()) {
  assertAuction(room.phase === "lobby", "This auction has already started.", 409, "ROOM_STARTED");
  assertAuction(room.participants.length < MAX_PLAYERS, "This room already has 10 teams.", 409, "ROOM_FULL");
  const duplicate = room.participants.some(
    (existing) => existing.teamName.localeCompare(participant.teamName, undefined, { sensitivity: "accent" }) === 0,
  );
  assertAuction(!duplicate, "That team name is already in this room.", 409, "TEAM_NAME_TAKEN");
  room.participants.push(participant);
  touch(room, now);
}

export function configureRoom(room: AuctionRoom, adminPlayerId: string, sport: Sport, now = Date.now()) {
  assertAuction(room.adminPlayerId === adminPlayerId, "Only the administrator can configure the game.", 403, "ADMIN_ONLY");
  assertAuction(room.phase === "lobby", "The sport cannot be changed after the auction starts.", 409, "ROOM_STARTED");
  room.sport = sport;
  touch(room, now);
}

export function startRoom(room: AuctionRoom, adminPlayerId: string, now = Date.now()) {
  assertAuction(room.adminPlayerId === adminPlayerId, "Only the administrator can start the auction.", 403, "ADMIN_ONLY");
  assertAuction(room.phase === "lobby", "This auction has already started.", 409, "ROOM_STARTED");
  assertAuction(room.sport, "Select cricket or football before starting.", 422, "SPORT_REQUIRED");
  assertAuction(room.participants.length > 0, "At least one team is required.", 422, "TEAM_REQUIRED");

  room.queue = secureShuffle(
    athleteCatalog.filter((athlete) => athlete.sport === room.sport).map((athlete) => athlete.id),
  );
  assertAuction(room.queue.length > 0, "No athletes are available for that sport.", 503, "EMPTY_CATALOG");
  room.lotIndex = 0;
  room.phase = "reveal";
  room.leaderId = null;
  room.currentBid = currentAthlete(room)?.basePrice ?? 0;
  room.deadlineAt = null;
  room.transitionAt = toIso(now + REVEAL_WINDOW_MS);
  touch(room, now);
}

function settleCurrentLot(room: AuctionRoom, now: number) {
  const athlete = currentAthlete(room);
  assertAuction(athlete, "The current athlete could not be resolved.", 500, "ATHLETE_MISSING");
  room.deadlineAt = null;
  room.transitionAt = toIso(now + RESULT_WINDOW_MS);

  if (!room.leaderId) {
    room.phase = "unsold";
    room.unsoldAthleteIds.push(athlete.id);
    return;
  }

  const winner = room.participants.find((participant) => participant.id === room.leaderId);
  assertAuction(winner, "The winning team could not be resolved.", 500, "WINNER_MISSING");
  winner.budget -= room.currentBid;
  winner.squad.push({ athleteId: athlete.id, amount: room.currentBid, acquiredAt: toIso(now) });
  room.sales.push({ athleteId: athlete.id, participantId: winner.id, amount: room.currentBid, soldAt: toIso(now) });
  room.phase = "sold";
}

function advanceLot(room: AuctionRoom, now: number) {
  if (room.lotIndex + 1 >= room.queue.length) {
    room.phase = "complete";
    room.transitionAt = null;
    room.deadlineAt = null;
    room.leaderId = null;
    return;
  }

  room.lotIndex += 1;
  room.phase = "reveal";
  room.leaderId = null;
  room.currentBid = currentAthlete(room)?.basePrice ?? 0;
  room.deadlineAt = null;
  room.transitionAt = toIso(now + REVEAL_WINDOW_MS);
}

export function settleRoom(room: AuctionRoom, now = Date.now()) {
  let changed = false;
  let guard = 0;

  while (guard < 3) {
    guard += 1;
    if (room.phase === "reveal" && room.transitionAt && now >= Date.parse(room.transitionAt)) {
      room.phase = "bidding";
      room.transitionAt = null;
      room.deadlineAt = toIso(now + BID_WINDOW_MS);
      changed = true;
      continue;
    }
    if (room.phase === "bidding" && room.deadlineAt && now >= Date.parse(room.deadlineAt)) {
      settleCurrentLot(room, now);
      changed = true;
      continue;
    }
    if ((room.phase === "sold" || room.phase === "unsold") && room.transitionAt && now >= Date.parse(room.transitionAt)) {
      advanceLot(room, now);
      changed = true;
      continue;
    }
    break;
  }

  if (changed) touch(room, now);
  return changed;
}

export function bidForParticipant(room: AuctionRoom, participantId: string, now = Date.now()) {
  settleRoom(room, now);
  assertAuction(room.phase === "bidding", "Bidding is not open for this lot.", 409, "BIDDING_CLOSED");
  assertAuction(room.deadlineAt && now < Date.parse(room.deadlineAt), "The bidding window has closed.", 409, "BIDDING_CLOSED");
  assertAuction(room.leaderId !== participantId, "Your team already has the highest bid.", 409, "ALREADY_LEADING");

  const participant = room.participants.find((candidate) => candidate.id === participantId);
  const athlete = currentAthlete(room);
  assertAuction(participant, "The bidding team is not part of this room.", 403, "PLAYER_NOT_FOUND");
  assertAuction(athlete, "The current athlete could not be resolved.", 500, "ATHLETE_MISSING");

  const amount = room.leaderId ? nextBidAmount(room.currentBid, athlete.basePrice) : athlete.basePrice;
  assertAuction(canBid(participant, amount), "Your team does not have enough available budget for this bid.", 409, "INSUFFICIENT_BUDGET");

  room.currentBid = amount;
  room.leaderId = participantId;
  room.deadlineAt = toIso(now + BID_WINDOW_MS);
  room.bids.unshift({ id: crypto.randomUUID(), athleteId: athlete.id, participantId, amount, at: toIso(now) });
  room.bids = room.bids.slice(0, 30);
  touch(room, now);
  return amount;
}

function participantToView(room: AuctionRoom, participant: RoomParticipant): ParticipantView {
  const { tokenHash, squad, ...safeParticipant } = participant;
  void tokenHash;
  return {
    ...safeParticipant,
    isAdmin: participant.id === room.adminPlayerId,
    squad: squad.flatMap((entry) => {
      const athlete = athleteById.get(entry.athleteId);
      return athlete ? [{ ...entry, athlete }] : [];
    }),
  };
}

export function toRoomView(room: AuctionRoom, selfPlayerId: string, now = Date.now()): RoomView {
  const { participants, queue, ...safeRoom } = room;
  return {
    ...safeRoom,
    serverTime: toIso(now),
    isAdmin: room.adminPlayerId === selfPlayerId,
    selfPlayerId,
    currentAthlete: currentAthlete(room),
    queueLength: queue.length,
    participants: participants.map((participant) => participantToView(room, participant)),
  };
}
