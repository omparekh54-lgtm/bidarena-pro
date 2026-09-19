import { Redis } from "@upstash/redis";
import { AuctionError } from "./errors";
import type { AuctionRoom, ChatMessage, FinalRoomResult } from "./types";

const ROOM_TTL_SECONDS = 60 * 60 * 24 * 30;
const LOCK_TTL_MS = 5_000;
const redisUrl = process.env.UPSTASH_REDIS_REST_URL
  ?? process.env.KV_REST_API_URL
  ?? process.env.UPSTASH_REDIS_REST_KV_REST_API_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN
  ?? process.env.KV_REST_API_TOKEN
  ?? process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN;
const redis = redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null;

type MemoryState = {
  rooms: Map<string, AuctionRoom>;
  expiresAt: Map<string, number>;
  locks: Map<string, Promise<void>>;
  results: Map<string, FinalRoomResult>;
  chats: Map<string, ChatMessage[]>;
  chatFiles: Map<string, { name: string; mimeType: string; bytes: Uint8Array }>;
};

const globalMemory = globalThis as typeof globalThis & { __bidarenaMemory?: MemoryState };
const memory = globalMemory.__bidarenaMemory ??= {
  rooms: new Map(),
  expiresAt: new Map(),
  locks: new Map(),
  results: new Map(),
  chats: new Map(),
  chatFiles: new Map(),
};
memory.results ??= new Map();
memory.chats ??= new Map();
memory.chatFiles ??= new Map();

function hydrateRoomDefaults(room: AuctionRoom) {
  room.cycleCount ??= 1;
  room.sessionResume ??= { endedAt: null, requestedAt: null, votes: [], claims: [] };
  room.sessionResume.votes ??= [];
  room.sessionResume.claims ??= [];
  room.tournament ??= {
    status: "setup",
    format: null,
    cricketOvers: 20,
    currentRound: 1,
    fixtures: [],
    standings: room.participants.map((participant) => ({
      participantId: participant.id,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      points: 0,
      scored: 0,
      conceded: 0,
      difference: 0,
      oversFor: 0,
      oversAgainst: 0,
      nrr: 0,
    })),
  };
  room.transferWindow ??= {
    status: "closed",
    startedAt: null,
    endsAt: null,
    durationSeconds: null,
    offers: [],
    resumeAuctionOnClose: false,
  };
  room.transferWindow.resumeAuctionOnClose ??= false;
  room.transferWindow.offers ??= [];
  return room;
}

function roomKey(code: string) {
  return `bidarena:room:${code}`;
}

function lockKey(code: string) {
  return `bidarena:lock:${code}`;
}

function resultKey(code: string) {
  return `bidarena:result:${code}`;
}

function chatKey(code: string) {
  return `bidarena:chat:${code}`;
}

function chatFileMetaKey(code: string, attachmentId: string) {
  return `bidarena:chat-file:${code}:${attachmentId}:meta`;
}

function chatFileChunkKey(code: string, attachmentId: string, index: number) {
  return `bidarena:chat-file:${code}:${attachmentId}:${index}`;
}

function cloneRoom(room: AuctionRoom) {
  return structuredClone(room);
}

function getMemoryRoom(code: string) {
  if ((memory.expiresAt.get(code) ?? 0) < Date.now()) {
    memory.rooms.delete(code);
    memory.expiresAt.delete(code);
    return null;
  }
  const room = memory.rooms.get(code);
  return room ? hydrateRoomDefaults(cloneRoom(room)) : null;
}

function setMemoryRoom(room: AuctionRoom) {
  memory.rooms.set(room.code, cloneRoom(room));
  memory.expiresAt.set(room.code, Date.now() + ROOM_TTL_SECONDS * 1_000);
}

async function withMemoryLock<T>(code: string, operation: () => Promise<T>) {
  const previous = memory.locks.get(code) ?? Promise.resolve();
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const current = previous.then(() => gate);
  memory.locks.set(code, current);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (memory.locks.get(code) === current) memory.locks.delete(code);
  }
}

async function acquireRedisLock(code: string) {
  const token = crypto.randomUUID();
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = await redis?.set(lockKey(code), token, { nx: true, px: LOCK_TTL_MS });
    if (result === "OK") return token;
    await new Promise((resolve) => setTimeout(resolve, 45 + attempt * 4));
  }
  throw new AuctionError("The room is processing another command. Please retry.", 503, "ROOM_BUSY");
}

async function releaseRedisLock(code: string, token: string) {
  await redis?.eval(
    "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
    [lockKey(code)],
    [token],
  );
}

export function durableRoomStoreConfigured() {
  return Boolean(redis);
}

export function roomStoreMode() {
  return redis ? "upstash-redis" : "in-memory-development";
}

export async function createRoomIfAvailable(room: AuctionRoom) {
  if (redis) {
    const result = await redis.set(roomKey(room.code), room, { nx: true, ex: ROOM_TTL_SECONDS });
    return result === "OK";
  }
  return withMemoryLock(room.code, async () => {
    if (getMemoryRoom(room.code)) return false;
    setMemoryRoom(room);
    return true;
  });
}

export async function readStoredRoom(code: string) {
  const room = redis
    ? await redis.get<AuctionRoom>(roomKey(code))
    : getMemoryRoom(code);
  if (!room) throw new AuctionError("That room code does not exist or has expired.", 404, "ROOM_NOT_FOUND");
  return hydrateRoomDefaults(room);
}

export async function mutateStoredRoom<T>(code: string, operation: (room: AuctionRoom) => T | Promise<T>) {
  if (!redis) {
    return withMemoryLock(code, async () => {
      const room = getMemoryRoom(code);
      if (!room) throw new AuctionError("That room code does not exist or has expired.", 404, "ROOM_NOT_FOUND");
      const result = await operation(room);
      setMemoryRoom(room);
      return { room, result };
    });
  }

  const token = await acquireRedisLock(code);
  try {
    const storedRoom = await redis.get<AuctionRoom>(roomKey(code));
    const room = storedRoom ? hydrateRoomDefaults(storedRoom) : null;
    if (!room) throw new AuctionError("That room code does not exist or has expired.", 404, "ROOM_NOT_FOUND");
    const result = await operation(room);
    await redis.set(roomKey(code), room, { ex: ROOM_TTL_SECONDS });
    return { room, result };
  } finally {
    await releaseRedisLock(code, token);
  }
}

/** Final results deliberately have no TTL so completed auctions outlive live-room expiry. */
export async function writeFinalResult(result: FinalRoomResult) {
  if (redis) {
    await redis.set(resultKey(result.code), result);
    return;
  }
  memory.results.set(result.code, structuredClone(result));
}

export async function readFinalResult(code: string) {
  const result = redis
    ? await redis.get<FinalRoomResult>(resultKey(code))
    : memory.results.get(code);
  if (!result) throw new AuctionError("Final results are not available for that room.", 404, "RESULT_NOT_FOUND");
  return structuredClone(result);
}


export async function readChatMessages(code: string, limit = 100) {
  if (redis) {
    const rows = await redis.lrange<string>(chatKey(code), 0, Math.max(0, limit - 1));
    return rows.map((row) => JSON.parse(row) as ChatMessage).reverse();
  }
  return structuredClone((memory.chats.get(code) ?? []).slice(-limit));
}

export async function appendChatMessage(code: string, message: ChatMessage) {
  if (redis) {
    await redis.lpush(chatKey(code), JSON.stringify(message));
    await redis.ltrim(chatKey(code), 0, 99);
    await redis.expire(chatKey(code), ROOM_TTL_SECONDS);
    return;
  }
  const messages = memory.chats.get(code) ?? [];
  messages.push(structuredClone(message));
  memory.chats.set(code, messages.slice(-100));
}

export async function writeChatAttachment(code: string, attachmentId: string, name: string, mimeType: string, bytes: Uint8Array) {
  const memoryKey = `${code}:${attachmentId}`;
  if (!redis) {
    memory.chatFiles.set(memoryKey, { name, mimeType, bytes: new Uint8Array(bytes) });
    return;
  }

  const chunkSize = 180_000;
  const base64 = Buffer.from(bytes).toString("base64");
  const chunks: string[] = [];
  for (let index = 0; index < base64.length; index += chunkSize) chunks.push(base64.slice(index, index + chunkSize));
  await redis.set(chatFileMetaKey(code, attachmentId), { name, mimeType, chunks: chunks.length, size: bytes.length }, { ex: ROOM_TTL_SECONDS });
  for (let index = 0; index < chunks.length; index += 1) {
    await redis.set(chatFileChunkKey(code, attachmentId, index), chunks[index], { ex: ROOM_TTL_SECONDS });
  }
}

export async function readChatAttachment(code: string, attachmentId: string) {
  const memoryKey = `${code}:${attachmentId}`;
  if (!redis) {
    const stored = memory.chatFiles.get(memoryKey);
    if (!stored) throw new AuctionError("That chat attachment is no longer available.", 404, "CHAT_FILE_NOT_FOUND");
    return { name: stored.name, mimeType: stored.mimeType, bytes: new Uint8Array(stored.bytes) };
  }

  const meta = await redis.get<{ name: string; mimeType: string; chunks: number; size: number }>(chatFileMetaKey(code, attachmentId));
  if (!meta) throw new AuctionError("That chat attachment is no longer available.", 404, "CHAT_FILE_NOT_FOUND");
  const chunks = await Promise.all(
    Array.from({ length: meta.chunks }, (_, index) => redis.get<string>(chatFileChunkKey(code, attachmentId, index))),
  );
  if (chunks.some((chunk) => chunk == null)) throw new AuctionError("That chat attachment is incomplete.", 410, "CHAT_FILE_INCOMPLETE");
  const bytes = Buffer.from(chunks.join(""), "base64");
  return { name: meta.name, mimeType: meta.mimeType, bytes: new Uint8Array(bytes) };
}
