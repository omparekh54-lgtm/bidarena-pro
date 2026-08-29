import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { athleteCatalog } from "@/data/catalog";
import { AuctionError, assertAuction } from "./errors";
import { addParticipant, bidForParticipant, configureRoom, createRoomState, pauseRoom, resumeRoom, roomNeedsSettlement, settleRoom, startRoom, stopRoom, toRoomView } from "./room-engine";
import { createRoomIfAvailable, mutateStoredRoom, readStoredRoom } from "./room-store";
import type { AuctionRoom, PlayerPoolMode, PlayerSession, RoomParticipant, RoomView, Sport } from "./types";

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
