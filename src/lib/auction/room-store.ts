import { Redis } from "@upstash/redis";
import { AuctionError } from "./errors";
import type { AuctionRoom, FinalRoomResult } from "./types";

const ROOM_TTL_SECONDS = 60 * 60 * 18;
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
};

const globalMemory = globalThis as typeof globalThis & { __bidarenaMemory?: MemoryState };
const memory = globalMemory.__bidarenaMemory ??= {
  rooms: new Map(),
  expiresAt: new Map(),
  locks: new Map(),
  results: new Map(),
};
memory.results ??= new Map();

function hydrateRoomDefaults(room: AuctionRoom) {
  room.cycleCount ??= 1;
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
