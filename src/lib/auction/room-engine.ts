import { athleteCatalog, athletesForPool } from "@/data/catalog";
import { canBid, nextBidAmount, secureShuffle } from "./engine";
import { assertAuction } from "./errors";
import type { Athlete, AuctionRoom, FinalRoomResult, ParticipantView, PlayerPoolMode, RoomParticipant, RoomView, Sport, TransferOffer, TransferOfferType } from "./types";

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

function cricketGroup(athlete: Athlete) {
  const role = athlete.role.toLowerCase();
  const secondary = athlete.secondaryRole?.toLowerCase() ?? "";
  if (role.includes("all-rounder")) return "all-rounder";
  if (role.includes("bowler")) {
    return role.includes("spin") || secondary.includes("spin") || secondary.includes("orthodox")
      ? "spinner"
      : "pacer";
  }
  if (role.includes("batter") || role.includes("wicketkeeper")) return "batter";
  return "other";
}

export function buildAuctionQueue(sport: Sport, playerPoolMode: PlayerPoolMode = "current") {
  const athletes = athletesForPool(sport, playerPoolMode);
  if (sport === "football") return secureShuffle(athletes.map((athlete) => athlete.id));

  const groups = {
    batter: secureShuffle(athletes.filter((athlete) => cricketGroup(athlete) === "batter")),
    pacer: secureShuffle(athletes.filter((athlete) => cricketGroup(athlete) === "pacer")),
    spinner: secureShuffle(athletes.filter((athlete) => cricketGroup(athlete) === "spinner")),
    allRounder: secureShuffle(athletes.filter((athlete) => cricketGroup(athlete) === "all-rounder")),
    other: secureShuffle(athletes.filter((athlete) => cricketGroup(athlete) === "other")),
  };

  return [
    ...groups.batter.slice(0, 10),
    ...groups.pacer.slice(0, 7),
    ...groups.spinner.slice(0, 3),
    ...groups.allRounder,
    ...groups.batter.slice(10),
    ...groups.pacer.slice(7),
    ...groups.spinner.slice(3),
    ...groups.other,
  ].map((athlete) => athlete.id);
}

export function createRoomState(code: string, admin: RoomParticipant, now = Date.now()): AuctionRoom {
  const createdAt = toIso(now);
  return {
    schemaVersion: 1,
    code,
    adminPlayerId: admin.id,
    sport: null,
    playerPoolMode: null,
    purse: null,
    phase: "lobby",
    cycleCount: 1,
    queue: [],
    lotIndex: 0,
    currentBid: 0,
    leaderId: null,
    deadlineAt: null,
    transitionAt: null,
    pausedAt: null,
    stoppedAt: null,
    participants: [admin],
    bids: [],
    sales: [],
    unsoldAthleteIds: [],
    transferWindow: {
      status: "closed",
      startedAt: null,
      endsAt: null,
      durationSeconds: null,
      offers: [],
      resumeAuctionOnClose: false,
    },
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
  if (room.purse) {
    participant.budget = room.purse;
    participant.initialBudget = room.purse;
  }
  room.participants.push(participant);
  touch(room, now);
}

export function configureRoom(room: AuctionRoom, adminPlayerId: string, sport: Sport, purse: number, playerPoolMode: PlayerPoolMode, now = Date.now()) {
  assertAuction(room.adminPlayerId === adminPlayerId, "Only the administrator can configure the game.", 403, "ADMIN_ONLY");
  assertAuction(room.phase === "lobby", "The sport cannot be changed after the auction starts.", 409, "ROOM_STARTED");
  const minimumPurse = sport === "cricket" ? 100 : 50;
  const maximumPurse = sport === "cricket" ? 100_000 : 10_000;
  assertAuction(Number.isInteger(purse) && purse >= minimumPurse && purse <= maximumPurse, "Choose a valid team purse for this sport.", 422, "INVALID_PURSE");
  room.sport = sport;
  room.playerPoolMode = playerPoolMode;
  room.purse = purse;
  for (const participant of room.participants) {
    participant.budget = purse;
    participant.initialBudget = purse;
  }
  touch(room, now);
}

export function startRoom(room: AuctionRoom, adminPlayerId: string, now = Date.now()) {
  assertAuction(room.adminPlayerId === adminPlayerId, "Only the administrator can start the auction.", 403, "ADMIN_ONLY");
  assertAuction(room.phase === "lobby", "This auction has already started.", 409, "ROOM_STARTED");
  assertAuction(room.sport, "Select cricket or football before starting.", 422, "SPORT_REQUIRED");
  assertAuction(room.purse, "Set the team purse before starting.", 422, "PURSE_REQUIRED");
  assertAuction(room.participants.length > 0, "At least one team is required.", 422, "TEAM_REQUIRED");

  room.queue = buildAuctionQueue(room.sport, room.playerPoolMode ?? "current");
  assertAuction(room.queue.length > 0, "No athletes are available for that sport.", 503, "EMPTY_CATALOG");
  room.lotIndex = 0;
  room.cycleCount = 1;
  room.phase = "reveal";
  room.leaderId = null;
  room.currentBid = currentAthlete(room)?.basePrice ?? 0;
  room.deadlineAt = null;
  room.transitionAt = toIso(now + REVEAL_WINDOW_MS);
  room.pausedAt = null;
  room.stoppedAt = null;
  touch(room, now);
}

export function pauseRoom(room: AuctionRoom, adminPlayerId: string, now = Date.now()) {
  assertAuction(room.adminPlayerId === adminPlayerId, "Only the administrator can pause the auction.", 403, "ADMIN_ONLY");
  settleRoom(room, now);
  assertAuction(room.phase !== "lobby" && room.phase !== "complete", "This auction cannot be paused now.", 409, "PAUSE_UNAVAILABLE");
  assertAuction(room.transferWindow.status === "closed", "The auction clock is already paused for the transfer window.", 409, "TRANSFER_WINDOW_OPEN");
  assertAuction(!room.pausedAt, "The auction is already paused.", 409, "ALREADY_PAUSED");
  room.pausedAt = toIso(now);
  touch(room, now);
}

export function resumeRoom(room: AuctionRoom, adminPlayerId: string, now = Date.now()) {
  assertAuction(room.adminPlayerId === adminPlayerId, "Only the administrator can resume the auction.", 403, "ADMIN_ONLY");
  assertAuction(room.transferWindow.status === "closed", "End the transfer window before resuming the auction.", 409, "TRANSFER_WINDOW_OPEN");
  assertAuction(room.pausedAt, "The auction is not paused.", 409, "NOT_PAUSED");
  const pauseDuration = Math.max(0, now - Date.parse(room.pausedAt));
  if (room.deadlineAt) room.deadlineAt = toIso(Date.parse(room.deadlineAt) + pauseDuration);
  if (room.transitionAt) room.transitionAt = toIso(Date.parse(room.transitionAt) + pauseDuration);
  room.pausedAt = null;
  touch(room, now);
}

export function stopRoom(room: AuctionRoom, adminPlayerId: string, now = Date.now()) {
  assertAuction(room.adminPlayerId === adminPlayerId, "Only the administrator can stop the auction.", 403, "ADMIN_ONLY");
  assertAuction(room.phase !== "lobby" && room.phase !== "complete", "This auction has already ended.", 409, "AUCTION_ENDED");
  closeTransferWindowInternal(room, now, false);
  room.phase = "complete";
  room.deadlineAt = null;
  room.transitionAt = null;
  room.pausedAt = null;
  room.stoppedAt = toIso(now);
  room.leaderId = null;
  touch(room, now);
}

function pauseClock(room: AuctionRoom, now: number) {
  if (!room.pausedAt) room.pausedAt = toIso(now);
}

function resumeClock(room: AuctionRoom, now: number) {
  if (!room.pausedAt) return;
  const pauseDuration = Math.max(0, now - Date.parse(room.pausedAt));
  if (room.deadlineAt) room.deadlineAt = toIso(Date.parse(room.deadlineAt) + pauseDuration);
  if (room.transitionAt) room.transitionAt = toIso(Date.parse(room.transitionAt) + pauseDuration);
  room.pausedAt = null;
}

function closeTransferWindowInternal(room: AuctionRoom, now: number, resumeAuction: boolean) {
  if (room.transferWindow.status === "closed") return false;
  for (const offer of room.transferWindow.offers) {
    if (offer.status === "pending") {
      offer.status = "expired";
      offer.respondedAt = toIso(now);
    }
  }
  const shouldResume = resumeAuction && room.transferWindow.resumeAuctionOnClose;
  room.transferWindow.status = "closed";
  room.transferWindow.startedAt = null;
  room.transferWindow.endsAt = null;
  room.transferWindow.durationSeconds = null;
  room.transferWindow.resumeAuctionOnClose = false;
  if (shouldResume) resumeClock(room, now);
  return true;
}

export function openTransferWindow(room: AuctionRoom, adminPlayerId: string, durationSeconds: number, now = Date.now()) {
  assertAuction(room.adminPlayerId === adminPlayerId, "Only the administrator can open the transfer window.", 403, "ADMIN_ONLY");
  settleRoom(room, now);
  assertAuction(room.phase !== "lobby" && room.phase !== "complete", "The transfer window is only available during a live auction.", 409, "TRANSFER_WINDOW_UNAVAILABLE");
  assertAuction(room.transferWindow.status === "closed", "The transfer window is already open.", 409, "TRANSFER_WINDOW_OPEN");
  assertAuction(Number.isInteger(durationSeconds) && durationSeconds >= 30 && durationSeconds <= 3_600, "Choose a transfer window between 30 seconds and 60 minutes.", 422, "INVALID_TRANSFER_DURATION");

  const resumeAuctionOnClose = !room.pausedAt;
  pauseClock(room, now);
  room.transferWindow = {
    status: "open",
    startedAt: toIso(now),
    endsAt: toIso(now + durationSeconds * 1_000),
    durationSeconds,
    offers: [],
    resumeAuctionOnClose,
  };
  touch(room, now);
}

export function closeTransferWindow(room: AuctionRoom, adminPlayerId: string, now = Date.now()) {
  assertAuction(room.adminPlayerId === adminPlayerId, "Only the administrator can close the transfer window.", 403, "ADMIN_ONLY");
  assertAuction(room.transferWindow.status === "open", "The transfer window is already closed.", 409, "TRANSFER_WINDOW_CLOSED");
  closeTransferWindowInternal(room, now, true);
  touch(room, now);
}

type TransferOfferInput = {
  type: TransferOfferType;
  toParticipantId: string;
  offeredAthleteIds: string[];
  requestedAthleteIds: string[];
  cashAdjustment: number;
};

function uniqueAthleteIds(ids: string[]) {
  return [...new Set(ids)];
}

function participantWithAthletes(room: AuctionRoom, participantId: string, athleteIds: string[], message: string) {
  const participant = room.participants.find((candidate) => candidate.id === participantId);
  assertAuction(participant, "That team is no longer in the room.", 404, "PARTICIPANT_NOT_FOUND");
  const squadIds = new Set(participant.squad.map((entry) => entry.athleteId));
  assertAuction(athleteIds.every((id) => squadIds.has(id)), message, 409, "TRANSFER_PLAYERS_CHANGED");
  return participant;
}

function validateOfferShape(input: TransferOfferInput) {
  assertAuction(Number.isInteger(input.cashAdjustment), "The cash adjustment must use the auction's whole currency units.", 422, "INVALID_CASH_ADJUSTMENT");
  assertAuction(input.offeredAthleteIds.length <= 20 && input.requestedAthleteIds.length <= 20, "A single offer can include at most 20 players from either team.", 422, "TRANSFER_OFFER_TOO_LARGE");
  if (input.type === "buy") assertAuction(input.offeredAthleteIds.length === 0 && input.requestedAthleteIds.length > 0, "A buy offer must request at least one player and offer no players.", 422, "INVALID_TRANSFER_OFFER");
  if (input.type === "sell") assertAuction(input.offeredAthleteIds.length > 0 && input.requestedAthleteIds.length === 0, "A sell offer must offer at least one player and request no players.", 422, "INVALID_TRANSFER_OFFER");
  if (input.type === "swap") assertAuction(input.offeredAthleteIds.length > 0 && input.requestedAthleteIds.length > 0, "A swap offer must include players from both teams.", 422, "INVALID_TRANSFER_OFFER");
}

export function createTransferOffer(room: AuctionRoom, fromParticipantId: string, input: TransferOfferInput, now = Date.now()) {
  settleRoom(room, now);
  assertAuction(room.transferWindow.status === "open", "The transfer window is closed.", 409, "TRANSFER_WINDOW_CLOSED");
  assertAuction(fromParticipantId !== input.toParticipantId, "Choose another team for this offer.", 422, "INVALID_TRANSFER_TARGET");
  const offeredAthleteIds = uniqueAthleteIds(input.offeredAthleteIds);
  const requestedAthleteIds = uniqueAthleteIds(input.requestedAthleteIds);
  const normalized = { ...input, offeredAthleteIds, requestedAthleteIds };
  validateOfferShape(normalized);
  participantWithAthletes(room, fromParticipantId, offeredAthleteIds, "One or more offered players are not in your squad.");
  participantWithAthletes(room, input.toParticipantId, requestedAthleteIds, "One or more requested players are not in that team's squad.");

  const offer: TransferOffer = {
    id: crypto.randomUUID(),
    ...normalized,
    fromParticipantId,
    status: "pending",
    createdAt: toIso(now),
  };
  room.transferWindow.offers.unshift(offer);
  touch(room, now);
  return offer;
}

function acceptTransferOffer(room: AuctionRoom, offer: TransferOffer, now: number) {
  const from = participantWithAthletes(room, offer.fromParticipantId, offer.offeredAthleteIds, "One of these players has since been traded.");
  const to = participantWithAthletes(room, offer.toParticipantId, offer.requestedAthleteIds, "One of these players has since been traded.");
  const fromBudget = from.budget - offer.cashAdjustment;
  const toBudget = to.budget + offer.cashAdjustment;
  assertAuction(fromBudget >= 0 && toBudget >= 0, "This transfer would leave one team with a negative budget.", 409, "INSUFFICIENT_TRANSFER_BUDGET");

  const offered = from.squad.filter((entry) => offer.offeredAthleteIds.includes(entry.athleteId));
  const requested = to.squad.filter((entry) => offer.requestedAthleteIds.includes(entry.athleteId));
  from.squad = from.squad.filter((entry) => !offer.offeredAthleteIds.includes(entry.athleteId));
  to.squad = to.squad.filter((entry) => !offer.requestedAthleteIds.includes(entry.athleteId));
  // The negotiated cash is tracked at team level. Historical acquisition prices stay attached
  // to each player while acquiredAt records the latest transfer time.
  from.squad.push(...requested.map((entry) => ({ ...entry, acquiredAt: toIso(now) })));
  to.squad.push(...offered.map((entry) => ({ ...entry, acquiredAt: toIso(now) })));
  from.budget = fromBudget;
  to.budget = toBudget;
}

export function respondToTransferOffer(room: AuctionRoom, participantId: string, offerId: string, decision: "accept" | "decline", now = Date.now()) {
  settleRoom(room, now);
  assertAuction(room.transferWindow.status === "open", "The transfer window is closed.", 409, "TRANSFER_WINDOW_CLOSED");
  const offer = room.transferWindow.offers.find((candidate) => candidate.id === offerId);
  assertAuction(offer, "That transfer offer does not exist.", 404, "TRANSFER_OFFER_NOT_FOUND");
  assertAuction(offer.toParticipantId === participantId, "Only the receiving team can respond to this offer.", 403, "TRANSFER_RESPONSE_FORBIDDEN");
  assertAuction(offer.status === "pending", "That transfer offer is no longer pending.", 409, "TRANSFER_OFFER_CLOSED");
  if (decision === "accept") acceptTransferOffer(room, offer, now);
  offer.status = decision === "accept" ? "accepted" : "declined";
  offer.respondedAt = toIso(now);
  touch(room, now);
  return offer;
}

export function cancelTransferOffer(room: AuctionRoom, participantId: string, offerId: string, now = Date.now()) {
  settleRoom(room, now);
  const offer = room.transferWindow.offers.find((candidate) => candidate.id === offerId);
  assertAuction(offer, "That transfer offer does not exist.", 404, "TRANSFER_OFFER_NOT_FOUND");
  assertAuction(offer.fromParticipantId === participantId, "Only the sending team can cancel this offer.", 403, "TRANSFER_CANCEL_FORBIDDEN");
  assertAuction(offer.status === "pending", "That transfer offer is no longer pending.", 409, "TRANSFER_OFFER_CLOSED");
  offer.status = "cancelled";
  offer.respondedAt = toIso(now);
  touch(room, now);
  return offer;
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
    const soldIds = new Set(room.sales.map((sale) => sale.athleteId));
    const recyclable = uniqueAthleteIds(room.unsoldAthleteIds).filter((athleteId) => !soldIds.has(athleteId));
    room.transitionAt = null;
    room.deadlineAt = null;
    room.leaderId = null;
    if (!recyclable.length) {
      room.phase = "between-lots";
      room.queue = [];
      room.lotIndex = 0;
      return;
    }
    room.queue = secureShuffle(recyclable);
    room.unsoldAthleteIds = [];
    room.lotIndex = 0;
    room.cycleCount += 1;
    room.phase = "reveal";
    room.currentBid = currentAthlete(room)?.basePrice ?? 0;
    room.transitionAt = toIso(now + REVEAL_WINDOW_MS);
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
  if (room.transferWindow.status === "open") {
    if (room.transferWindow.endsAt && now >= Date.parse(room.transferWindow.endsAt)) {
      changed = closeTransferWindowInternal(room, now, true) || changed;
    } else {
      return false;
    }
  }
  if (room.pausedAt) {
    if (changed) touch(room, now);
    return changed;
  }
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

export function roomNeedsSettlement(room: AuctionRoom, now = Date.now()) {
  if (room.transferWindow.status === "open") return Boolean(room.transferWindow.endsAt && now >= Date.parse(room.transferWindow.endsAt));
  if (room.pausedAt) return false;
  if (room.phase === "reveal") return Boolean(room.transitionAt && now >= Date.parse(room.transitionAt));
  if (room.phase === "bidding") return Boolean(room.deadlineAt && now >= Date.parse(room.deadlineAt));
  if (room.phase === "sold" || room.phase === "unsold") {
    return Boolean(room.transitionAt && now >= Date.parse(room.transitionAt));
  }
  return false;
}

export function bidForParticipant(room: AuctionRoom, participantId: string, now = Date.now()) {
  settleRoom(room, now);
  assertAuction(room.transferWindow.status === "closed", "Bidding is paused during the transfer window.", 409, "TRANSFER_WINDOW_OPEN");
  assertAuction(!room.pausedAt, "The administrator has paused the auction.", 409, "AUCTION_PAUSED");
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

function participantToView(room: AuctionRoom, participant: RoomParticipant, selfPlayerId: string): ParticipantView {
  const { tokenHash, squad, ...safeParticipant } = participant;
  void tokenHash;
  return {
    ...safeParticipant,
    isAdmin: participant.id === room.adminPlayerId,
    squadSize: squad.length,
    squad: (participant.id === selfPlayerId || room.transferWindow.status === "open" ? squad : []).flatMap((entry) => {
      const athlete = athleteById.get(entry.athleteId);
      return athlete ? [{ ...entry, athlete }] : [];
    }),
  };
}

export function toRoomView(room: AuctionRoom, selfPlayerId: string, now = Date.now()): RoomView {
  const { participants, queue, ...safeRoom } = room;
  const composition = new Map<string, number>();
  for (const athleteId of queue) {
    const role = athleteById.get(athleteId)?.role;
    if (role) composition.set(role, (composition.get(role) ?? 0) + 1);
  }
  return {
    ...safeRoom,
    playerPoolMode: room.playerPoolMode ?? "current",
    serverTime: toIso(now),
    isAdmin: room.adminPlayerId === selfPlayerId,
    selfPlayerId,
    currentAthlete: currentAthlete(room),
    queueLength: queue.length,
    poolComposition: [...composition].map(([role, count]) => ({ role, count })),
    transferWindow: {
      ...room.transferWindow,
      offers: room.transferWindow.offers.filter((offer) => offer.fromParticipantId === selfPlayerId || offer.toParticipantId === selfPlayerId),
    },
    participants: participants.map((participant) => participantToView(room, participant, selfPlayerId)),
  };
}

export function finalizeRoomResult(room: AuctionRoom): FinalRoomResult {
  assertAuction(room.phase === "complete" && room.sport && room.purse, "The room must be complete before results can be finalized.", 409, "RESULT_NOT_READY");
  return {
    code: room.code,
    sport: room.sport,
    playerPoolMode: room.playerPoolMode ?? "current",
    purse: room.purse,
    completedAt: room.stoppedAt ?? room.updatedAt,
    participants: room.participants.map((participant) => ({
      participantId: participant.id,
      teamName: participant.teamName,
      finalBudget: participant.budget,
      squad: participant.squad.flatMap((entry) => {
        const athlete = athleteById.get(entry.athleteId);
        if (!athlete) return [];
        const { id, name, shortName, role, country, team } = athlete;
        return [{ ...entry, athlete: { id, name, shortName, role, country, team } }];
      }),
    })),
  };
}
