import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { athleteCatalog } from "@/data/catalog";
import { AuctionError, assertAuction } from "./errors";
import { addParticipant, bidForParticipant, cancelTransferOffer as cancelTransferOfferInRoom, closeTransferWindow as closeTransferWindowInRoom, configureRoom, createRoomState, createTransferOffer as createTransferOfferInRoom, endSession as endSessionInRoom, finalizeRoomResult, openTransferWindow as openTransferWindowInRoom, pauseRoom, requestSessionResume as requestSessionResumeInRoom, respondToTransferOffer as respondToTransferOfferInRoom, resumeRoom, roomNeedsSettlement, settleRoom, startRoom, stopRoom, toRoomView } from "./room-engine";
import { appendChatMessage, createRoomIfAvailable, mutateStoredRoom, readChatAttachment, readChatMessages, readFinalResult, readStoredRoom, writeChatAttachment, writeFinalResult } from "./room-store";
import { callToss as callTossInRoom, chooseTossDecision as chooseTossDecisionInRoom, setupTournament as setupTournamentInRoom, startTournamentRound as startTournamentRoundInRoom, submitCricketLineup as submitCricketLineupInRoom, submitFootballLineup as submitFootballLineupInRoom } from "./tournament-engine";
import type { AuctionRoom, ChatAttachmentPayload, ChatMessage, CricketLineup, FootballLineup, PlayerPoolMode, PlayerSession, ResumeGameInfo, RoomParticipant, RoomView, Sport, TournamentFormat, TransferOfferType } from "./types";

const TEAM_COLORS = ["#56e0c4", "#ff6b67", "#5b8cff", "#f4b941", "#b987ff", "#38bdf8", "#fb7185", "#a3e635", "#f97316", "#e879f9"];

function validateRoomCode(code: string) {
  assertAuction(/^\d{4}$/.test(code), "Enter the four-digit room code.", 422, "INVALID_ROOM_CODE");
  return code;
}

function roomCode() {
  const values = new Uint16Array(1);
  crypto.getRandomValues(values);
  return String(values[0] % 10_000).padStart(4, "0");
}

function sessionToken() {
  return randomBytes(32).toString("base64url");
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function teamCode(teamName: string) {
  const words = teamName.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words.slice(0, 2).map((word) => word[0]).join("") : words[0].slice(0, 2)).toUpperCase();
}

function makeParticipant(teamName: string, color: string, token: string, now = Date.now()): RoomParticipant {
  return {
    id: crypto.randomUUID(),
    teamName: teamName.trim(),
    code: teamCode(teamName),
    color,
    budget: 0,
    initialBudget: 0,
    squad: [],
    joinedAt: new Date(now).toISOString(),
    tokenHash: tokenHash(token),
  };
}

function authenticate(room: AuctionRoom, playerId: string, token: string) {
  const participant = room.participants.find((candidate) => candidate.id === playerId);
  assertAuction(participant && token, "Your room session is invalid. Join the room again.", 401, "INVALID_SESSION");
  const expected = Buffer.from(participant.tokenHash, "hex");
  const actual = Buffer.from(tokenHash(token), "hex");
  assertAuction(expected.length === actual.length && timingSafeEqual(expected, actual), "Your room session is invalid. Join the room again.", 401, "INVALID_SESSION");
  return participant;
}

function toSession(code: string, participant: RoomParticipant, token: string): PlayerSession {
  return { roomCode: code, playerId: participant.id, token, teamName: participant.teamName };
}

export async function createGame(teamName: string) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const code = roomCode();
    const token = sessionToken();
    const admin = makeParticipant(teamName, TEAM_COLORS[0], token);
    const room = createRoomState(code, admin);
    if (await createRoomIfAvailable(room)) {
      return { session: toSession(code, admin, token), room: toRoomView(room, admin.id) };
    }
  }
  throw new AuctionError("A room code could not be allocated. Please try again.", 503, "ROOM_CODE_UNAVAILABLE");
}

export async function joinGame(code: string, teamName: string) {
  validateRoomCode(code);
  const token = sessionToken();
  const result = await mutateStoredRoom(code, (room) => {
    settleRoom(room);
    const participant = makeParticipant(teamName, TEAM_COLORS[room.participants.length % TEAM_COLORS.length], token);
    addParticipant(room, participant);
    return participant;
  });
  return { session: toSession(code, result.result, token), room: toRoomView(result.room, result.result.id) };
}

export async function getGame(code: string, playerId: string, token: string): Promise<RoomView> {
  validateRoomCode(code);
  const snapshot = await readStoredRoom(code);
  authenticate(snapshot, playerId, token);
  if (!roomNeedsSettlement(snapshot)) return toRoomView(snapshot, playerId);

  const result = await mutateStoredRoom(code, (room) => {
    authenticate(room, playerId, token);
    settleRoom(room);
  });
  return toRoomView(result.room, playerId);
}

export async function configureGame(code: string, playerId: string, token: string, sport: Sport, purse: number, playerPoolMode: PlayerPoolMode) {
  validateRoomCode(code);
  const result = await mutateStoredRoom(code, (room) => {
    authenticate(room, playerId, token);
    configureRoom(room, playerId, sport, purse, playerPoolMode);
  });
  return toRoomView(result.room, playerId);
}

export async function pauseGame(code: string, playerId: string, token: string) {
  validateRoomCode(code);
  const result = await mutateStoredRoom(code, (room) => {
    authenticate(room, playerId, token);
    pauseRoom(room, playerId);
  });
  return toRoomView(result.room, playerId);
}

export async function resumeGame(code: string, playerId: string, token: string) {
  validateRoomCode(code);
  const result = await mutateStoredRoom(code, (room) => {
    authenticate(room, playerId, token);
    resumeRoom(room, playerId);
  });
  return toRoomView(result.room, playerId);
}

export async function stopGame(code: string, playerId: string, token: string) {
  validateRoomCode(code);
  const result = await mutateStoredRoom(code, (room) => {
    authenticate(room, playerId, token);
    stopRoom(room, playerId);
  });
  return toRoomView(result.room, playerId);
}

export async function openTransferWindow(code: string, playerId: string, token: string, durationSeconds: number) {
  validateRoomCode(code);
  const result = await mutateStoredRoom(code, (room) => {
    authenticate(room, playerId, token);
    openTransferWindowInRoom(room, playerId, durationSeconds);
  });
  return toRoomView(result.room, playerId);
}

export async function closeTransferWindow(code: string, playerId: string, token: string) {
  validateRoomCode(code);
  const result = await mutateStoredRoom(code, (room) => {
    authenticate(room, playerId, token);
    closeTransferWindowInRoom(room, playerId);
  });
  return toRoomView(result.room, playerId);
}

type TransferOfferInput = {
  type: TransferOfferType;
  toParticipantId: string;
  offeredAthleteIds: string[];
  requestedAthleteIds: string[];
  cashAdjustment: number;
};

export async function createTransferOffer(code: string, playerId: string, token: string, input: TransferOfferInput) {
  validateRoomCode(code);
  const result = await mutateStoredRoom(code, (room) => {
    authenticate(room, playerId, token);
    createTransferOfferInRoom(room, playerId, input);
  });
  return toRoomView(result.room, playerId);
}

export async function respondToTransferOffer(code: string, playerId: string, token: string, offerId: string, decision: "accept" | "decline") {
  validateRoomCode(code);
  const result = await mutateStoredRoom(code, (room) => {
    authenticate(room, playerId, token);
    respondToTransferOfferInRoom(room, playerId, offerId, decision);
  });
  return toRoomView(result.room, playerId);
}

export async function cancelTransferOffer(code: string, playerId: string, token: string, offerId: string) {
  validateRoomCode(code);
  const result = await mutateStoredRoom(code, (room) => {
    authenticate(room, playerId, token);
    cancelTransferOfferInRoom(room, playerId, offerId);
  });
  return toRoomView(result.room, playerId);
}

export async function getFinalResult(code: string) {
  validateRoomCode(code);
  return readFinalResult(code);
}

export async function startGame(code: string, playerId: string, token: string) {
  validateRoomCode(code);
  const result = await mutateStoredRoom(code, (room) => {
    authenticate(room, playerId, token);
    startRoom(room, playerId);
  });
  return toRoomView(result.room, playerId);
}

export async function placeGameBid(code: string, playerId: string, token: string) {
  validateRoomCode(code);
  const result = await mutateStoredRoom(code, (room) => {
    authenticate(room, playerId, token);
    return bidForParticipant(room, playerId);
  });
  return { room: toRoomView(result.room, playerId), acceptedAmount: result.result };
}

export function playerCatalogSummary() {
  const byMode = (sport: Sport, era: "current" | "legend") => {
    const athletes = athleteCatalog.filter((athlete) => athlete.sport === sport && athlete.era === era);
    return {
      players: athletes.length,
      playersWithStats: athletes.filter((athlete) => athlete.realStats.length > 0).length,
      stats: athletes.reduce((count, athlete) => count + athlete.realStats.length, 0),
    };
  };
  return {
    cricket: athleteCatalog.filter((athlete) => athlete.sport === "cricket").length,
    football: athleteCatalog.filter((athlete) => athlete.sport === "football").length,
    performanceStats: athleteCatalog.reduce((count, athlete) => count + athlete.realStats.length, 0),
    coverage: {
      cricket: { current: byMode("cricket", "current"), legends: byMode("cricket", "legend") },
      football: { current: byMode("football", "current"), legends: byMode("football", "legend") },
    },
  };
}


export async function endGameSession(code: string, playerId: string, token: string) {
  validateRoomCode(code);
  const result = await mutateStoredRoom(code, (room) => {
    authenticate(room, playerId, token);
    endSessionInRoom(room, playerId);
  });
  return toRoomView(result.room, playerId);
}

export async function voteToResumeGame(code: string, playerId: string, token: string) {
  validateRoomCode(code);
  const result = await mutateStoredRoom(code, (room) => {
    authenticate(room, playerId, token);
    requestSessionResumeInRoom(room, playerId);
  });
  return toRoomView(result.room, playerId);
}

export async function configureTournament(code: string, playerId: string, token: string, format: TournamentFormat, cricketOvers: 10 | 20 | 50) {
  validateRoomCode(code);
  const result = await mutateStoredRoom(code, (room) => {
    authenticate(room, playerId, token);
    setupTournamentInRoom(room, playerId, format, cricketOvers);
  });
  return toRoomView(result.room, playerId);
}

export async function submitFootballTournamentLineup(code: string, playerId: string, token: string, fixtureId: string, lineup: FootballLineup) {
  validateRoomCode(code);
  const result = await mutateStoredRoom(code, (room) => {
    authenticate(room, playerId, token);
    submitFootballLineupInRoom(room, playerId, fixtureId, lineup);
  });
  return toRoomView(result.room, playerId);
}

export async function submitCricketTournamentLineup(code: string, playerId: string, token: string, fixtureId: string, lineup: CricketLineup) {
  validateRoomCode(code);
  const result = await mutateStoredRoom(code, (room) => {
    authenticate(room, playerId, token);
    submitCricketLineupInRoom(room, playerId, fixtureId, lineup);
  });
  return toRoomView(result.room, playerId);
}

export async function callTournamentToss(code: string, playerId: string, token: string, fixtureId: string, call: "heads" | "tails") {
  validateRoomCode(code);
  const result = await mutateStoredRoom(code, (room) => {
    authenticate(room, playerId, token);
    callTossInRoom(room, playerId, fixtureId, call);
  });
  return toRoomView(result.room, playerId);
}

export async function chooseTournamentTossDecision(code: string, playerId: string, token: string, fixtureId: string, decision: "bat" | "bowl") {
  validateRoomCode(code);
  const result = await mutateStoredRoom(code, (room) => {
    authenticate(room, playerId, token);
    chooseTossDecisionInRoom(room, playerId, fixtureId, decision);
  });
  return toRoomView(result.room, playerId);
}

export async function startTournamentRound(code: string, playerId: string, token: string, expectedRound?: number) {
  validateRoomCode(code);
  const result = await mutateStoredRoom(code, async (room) => {
    authenticate(room, playerId, token);
    if (expectedRound !== undefined) {
      assertAuction(
        room.tournament.currentRound === expectedRound,
        "That tournament round has already advanced. Refreshing the latest game state.",
        409,
        "STALE_TOURNAMENT_ROUND",
      );
    }
    startTournamentRoundInRoom(room, playerId);
    if (room.phase === "complete" && room.sport && room.purse) {
      await writeFinalResult(finalizeRoomResult(room));
    }
  });
  return toRoomView(result.room, playerId);
}


export async function getResumeGameInfo(code: string): Promise<ResumeGameInfo> {
  validateRoomCode(code);
  const room = await readStoredRoom(code);
  assertAuction(room.sessionResume.endedAt, "That game is not currently saved for continuation.", 409, "GAME_NOT_SAVED");
  return {
    code: room.code,
    sport: room.sport,
    phase: room.phase,
    tournamentRound: room.tournament.currentRound,
    endedAt: room.sessionResume.endedAt,
    participants: room.participants.map((participant) => ({
      id: participant.id,
      teamName: participant.teamName,
      code: participant.code,
      isAdmin: participant.id === room.adminPlayerId,
    })),
  };
}

export async function requestResumeTeamClaim(code: string, participantId: string) {
  validateRoomCode(code);
  const claimToken = sessionToken();
  const result = await mutateStoredRoom(code, (room) => {
    assertAuction(room.sessionResume.endedAt, "That game is not currently saved for continuation.", 409, "GAME_NOT_SAVED");
    const participant = room.participants.find((candidate) => candidate.id === participantId);
    assertAuction(participant, "That team is not part of this saved game.", 404, "TEAM_NOT_FOUND");
    assertAuction(participant.id !== room.adminPlayerId, "The host team must continue from its recognized device.", 409, "HOST_DEVICE_REQUIRED");
    const existing = room.sessionResume.claims.find((claim) => claim.participantId === participantId && !claim.approvedAt);
    assertAuction(!existing, "A device approval request is already waiting for this team.", 409, "CLAIM_ALREADY_PENDING");
    const claim = {
      id: crypto.randomUUID(),
      participantId,
      requestedAt: new Date().toISOString(),
      tokenHash: tokenHash(claimToken),
    };
    room.sessionResume.claims.push(claim);
    room.updatedAt = new Date().toISOString();
    room.version += 1;
    return claim;
  });
  return { claimId: result.result.id, claimToken, teamName: result.room.participants.find((p) => p.id === participantId)!.teamName };
}

export async function getResumeTeamClaimStatus(code: string, claimId: string, claimToken: string) {
  validateRoomCode(code);
  const room = await readStoredRoom(code);
  const claim = room.sessionResume.claims.find((candidate) => candidate.id === claimId);
  assertAuction(claim, "That continuation request does not exist.", 404, "CLAIM_NOT_FOUND");
  assertAuction(tokenHash(claimToken) === claim.tokenHash, "That continuation request is invalid.", 401, "INVALID_CLAIM");
  const participant = room.participants.find((candidate) => candidate.id === claim.participantId)!;
  if (!claim.approvedAt) return { approved: false as const, teamName: participant.teamName };
  return {
    approved: true as const,
    session: toSession(code, participant, claimToken),
    teamName: participant.teamName,
  };
}

export async function approveResumeTeamClaim(code: string, adminPlayerId: string, adminToken: string, claimId: string) {
  validateRoomCode(code);
  const result = await mutateStoredRoom(code, (room) => {
    authenticate(room, adminPlayerId, adminToken);
    assertAuction(room.adminPlayerId === adminPlayerId, "Only the administrator can approve a returning device.", 403, "ADMIN_ONLY");
    assertAuction(room.sessionResume.endedAt, "This game is not waiting to continue.", 409, "SESSION_NOT_ENDED");
    const claim = room.sessionResume.claims.find((candidate) => candidate.id === claimId);
    assertAuction(claim, "That continuation request does not exist.", 404, "CLAIM_NOT_FOUND");
    assertAuction(!claim.approvedAt, "That continuation request has already been approved.", 409, "CLAIM_ALREADY_APPROVED");
    const participant = room.participants.find((candidate) => candidate.id === claim.participantId);
    assertAuction(participant, "The requested team no longer exists.", 404, "TEAM_NOT_FOUND");
    participant.tokenHash = claim.tokenHash;
    claim.approvedAt = new Date().toISOString();
    room.updatedAt = new Date().toISOString();
    room.version += 1;
  });
  return toRoomView(result.room, adminPlayerId);
}


const CHAT_ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/octet-stream",
]);
const CHAT_MAX_FILE_BYTES = 2_000_000;
const CHAT_MAX_TOTAL_BYTES = 2_500_000;
const CHAT_MAX_ATTACHMENTS = 3;
const CHAT_MAX_TEXT_LENGTH = 2_000;

function validateChatAttachment(input: ChatAttachmentPayload) {
  assertAuction(input.name.trim().length > 0 && input.name.length <= 120, "Choose a valid file name.", 422, "INVALID_CHAT_FILE_NAME");
  assertAuction(CHAT_ALLOWED_MIME_TYPES.has(input.mimeType), "That file type is not supported in room chat.", 422, "UNSUPPORTED_CHAT_FILE");
  assertAuction(Number.isInteger(input.size) && input.size > 0 && input.size <= CHAT_MAX_FILE_BYTES, "Each chat file must be 2 MB or smaller.", 422, "CHAT_FILE_TOO_LARGE");
  const bytes = Buffer.from(input.base64, "base64");
  assertAuction(bytes.length === input.size, "That chat file could not be validated.", 422, "INVALID_CHAT_FILE");
  return bytes;
}

export async function getRoomChat(code: string, playerId: string, token: string) {
  validateRoomCode(code);
  const room = await readStoredRoom(code);
  authenticate(room, playerId, token);
  return readChatMessages(code, 100);
}

export async function sendRoomChatMessage(
  code: string,
  playerId: string,
  token: string,
  text: string,
  attachments: ChatAttachmentPayload[],
) {
  validateRoomCode(code);
  const room = await readStoredRoom(code);
  const participant = authenticate(room, playerId, token);
  const normalizedText = text.trim();
  assertAuction(normalizedText.length <= CHAT_MAX_TEXT_LENGTH, "Chat messages can contain at most 2,000 characters.", 422, "CHAT_MESSAGE_TOO_LONG");
  assertAuction(attachments.length <= CHAT_MAX_ATTACHMENTS, "Attach at most three files to one message.", 422, "TOO_MANY_CHAT_FILES");
  assertAuction(normalizedText.length > 0 || attachments.length > 0, "Write a message or attach a file.", 422, "EMPTY_CHAT_MESSAGE");

  const decoded = attachments.map((attachment) => ({ attachment, bytes: validateChatAttachment(attachment) }));
  const totalBytes = decoded.reduce((total, item) => total + item.bytes.length, 0);
  assertAuction(totalBytes <= CHAT_MAX_TOTAL_BYTES, "The files in one chat message must total 2.5 MB or less.", 422, "CHAT_FILES_TOO_LARGE");

  const storedAttachments = [];
  for (const item of decoded) {
    const id = crypto.randomUUID();
    await writeChatAttachment(code, id, item.attachment.name.trim(), item.attachment.mimeType, item.bytes);
    storedAttachments.push({ id, name: item.attachment.name.trim(), mimeType: item.attachment.mimeType, size: item.bytes.length });
  }

  const message: ChatMessage = {
    id: crypto.randomUUID(),
    participantId: participant.id,
    teamName: participant.teamName,
    teamCode: participant.code,
    color: participant.color,
    text: normalizedText,
    attachments: storedAttachments,
    createdAt: new Date().toISOString(),
  };
  await appendChatMessage(code, message);
  return message;
}

export async function getRoomChatAttachment(code: string, playerId: string, token: string, attachmentId: string) {
  validateRoomCode(code);
  assertAuction(/^[0-9a-f-]{36}$/i.test(attachmentId), "That attachment is invalid.", 422, "INVALID_CHAT_FILE");
  const room = await readStoredRoom(code);
  authenticate(room, playerId, token);
  return readChatAttachment(code, attachmentId);
}
