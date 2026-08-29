import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const seedsPath = resolve(root, "src/data/player-seeds.json");
const outputPath = resolve(root, "src/data/generated/player-stats.json");
const footballKey = process.env.API_FOOTBALL_KEY;
const cricketKey = process.env.CRICKETDATA_API_KEY;
const sportFilter = process.env.BIDARENA_SYNC_SPORT;
const offset = Number(process.env.BIDARENA_SYNC_OFFSET ?? 0);
const limit = Number(process.env.BIDARENA_SYNC_LIMIT ?? Number.POSITIVE_INFINITY);
const verifiedAt = new Date().toISOString();

const seeds = JSON.parse(await readFile(seedsPath, "utf8"));
let output = {};
try {
  output = JSON.parse(await readFile(outputPath, "utf8"));
} catch {
  // The first successful synchronization creates the generated cache.
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function source(provider, sourceUrl) {
  return { provider, kind: "performance", sourceUrl, verifiedAt };
}

function stat(label, value, scope, statSource) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  return { label, value: String(value).trim(), scope, source: statSource };
}

function playerMatchScore(seed, candidate) {
  const wanted = normalize(seed.name);
  const actual = normalize(candidate?.name);
  const wantedParts = new Set(wanted.split(" "));
  const actualParts = new Set(actual.split(" "));
  let score = wanted === actual ? 100 : 0;
  for (const part of wantedParts) if (actualParts.has(part)) score += part.length;
  if (normalize(candidate?.nationality ?? candidate?.country) === normalize(seed.country)) score += 15;
  return score;
}

async function cricketJson(path, params) {
  if (!cricketKey) throw new Error("CRICKETDATA_API_KEY is not configured");
  const query = new URLSearchParams({ ...params, apikey: cricketKey });
  const response = await fetch(`https://api.cricapi.com/v1/${path}?${query}`);
  if (!response.ok) throw new Error(`CricketData.org request failed (${response.status})`);
  const payload = await response.json();
  if (payload?.status !== "success") throw new Error(`CricketData.org provider error: ${payload?.reason ?? payload?.status}`);
  return payload;
}

async function footballJson(path, params) {
  if (!footballKey) throw new Error("API_FOOTBALL_KEY is not configured");
  const query = new URLSearchParams(params);
  const response = await fetch(`https://v3.football.api-sports.io/${path}?${query}`, {
    headers: { "x-apisports-key": footballKey },
  });
  if (!response.ok) throw new Error(`API-Football request failed (${response.status})`);
  const payload = await response.json();
  if (payload?.errors && Object.keys(payload.errors).length) {
    throw new Error(`API-Football provider error: ${JSON.stringify(payload.errors)}`);
  }
  return payload;
}

function cricketStats(records, seed) {
  const latest = new Map();
  for (const record of records ?? []) {
    const discipline = normalize(record?.fn);
    const format = normalize(record?.matchtype);
    const key = normalize(record?.stat);
    const value = String(record?.value ?? "").trim();
    if (discipline && format && key && value) latest.set(`${discipline}:${format}:${key}`, value);
  }

  const role = normalize(seed.role);
  const disciplines = role.includes("all rounder")
    ? ["batting", "bowling"]
    : role.includes("bowler")
      ? ["bowling"]
      : ["batting"];
  const fields = {
    batting: [["m", "Matches"], ["runs", "Runs"], ["avg", "Average"], ["sr", "Strike rate"], ["hs", "High score"], ["100", "Centuries"], ["100s", "Centuries"], ["50", "Fifties"], ["50s", "Fifties"]],
    bowling: [["m", "Matches"], ["wkts", "Wickets"], ["avg", "Average"], ["econ", "Economy"], ["sr", "Strike rate"], ["bbi", "Best innings"], ["5w", "Five-wicket hauls"]],
  };
  const formats = ["test", "odi", "t20", "t20i", "ipl"];
  const seen = new Set();
  const result = [];
  const statSource = source("CricketData.org", "https://cricketdata.org/cricket-data-formats/players/");

  for (const format of formats) {
    for (const discipline of disciplines) {
      for (const [key, label] of fields[discipline]) {
        const dedupeKey = `${format}:${discipline}:${label}`;
        if (seen.has(dedupeKey)) continue;
        const value = latest.get(`${discipline}:${format}:${key}`);
        const item = stat(label, value, `${format.toUpperCase()} · ${discipline === "batting" ? "Batting" : "Bowling"}`, statSource);
        if (item) {
          seen.add(dedupeKey);
          result.push(item);
        }
      }
    }
  }
  return result;
}

async function syncCricket(seed) {
  const list = await cricketJson("players", { offset: "0", search: seed.name });
  const candidates = Array.isArray(list.data) ? list.data : [];
  const player = candidates.toSorted((a, b) => playerMatchScore(seed, b) - playerMatchScore(seed, a))[0];
  if (!player?.id || playerMatchScore(seed, player) < 10) throw new Error(`No reliable CricketData.org match for ${seed.name}`);
  const infoPayload = await cricketJson("players_info", { id: String(player.id) });
  const info = infoPayload.data;
  const stats = cricketStats(info?.stats, seed);
  if (stats.length < 4) throw new Error(`Insufficient CricketData.org statistics for ${seed.name}`);
  return {
    providerId: String(player.id),
    imageUrl: info?.playerImg?.startsWith("http") ? info.playerImg : undefined,
    verifiedAt,
    profile: {
      dateOfBirth: info?.dateOfBirth ?? null,
      placeOfBirth: info?.placeOfBirth ?? null,
      battingStyle: info?.battingStyle ?? null,
      bowlingStyle: info?.bowlingStyle ?? null,
      providerRole: info?.role ?? null,
    },
    stats,
  };
}

function sum(records, getter) {
  return records.reduce((total, record) => total + (Number(getter(record)) || 0), 0);
}

function footballStats(records, season) {
  const played = (records ?? []).filter((record) => Number(record?.games?.appearences) > 0);
  if (!played.length) return [];
  const appearances = sum(played, (record) => record.games?.appearences);
  const weightedRating = played.reduce((total, record) => total + (Number(record.games?.rating) || 0) * (Number(record.games?.appearences) || 0), 0);
  const scope = `All competitions · ${season}`;
  const statSource = source("API-Football", "https://api-sports.io/documentation/football/v3");
  const values = [
    ["Appearances", appearances],
    ["Minutes", sum(played, (record) => record.games?.minutes)],
    ["Goals", sum(played, (record) => record.goals?.total)],
    ["Assists", sum(played, (record) => record.goals?.assists)],
    ["Average rating", weightedRating && appearances ? (weightedRating / appearances).toFixed(2) : null],
    ["Shots", sum(played, (record) => record.shots?.total)],
    ["Shots on target", sum(played, (record) => record.shots?.on)],
    ["Key passes", sum(played, (record) => record.passes?.key)],
    ["Passes", sum(played, (record) => record.passes?.total)],
    ["Tackles", sum(played, (record) => record.tackles?.total)],
    ["Interceptions", sum(played, (record) => record.tackles?.interceptions)],
    ["Duels won", sum(played, (record) => record.duels?.won)],
    ["Successful dribbles", sum(played, (record) => record.dribbles?.success)],
    ["Saves", sum(played, (record) => record.goals?.saves)],
    ["Goals conceded", sum(played, (record) => record.goals?.conceded)],
    ["Yellow cards", sum(played, (record) => record.cards?.yellow)],
    ["Red cards", sum(played, (record) => record.cards?.red)],
  ];
  return values.flatMap(([label, value]) => {
    const item = stat(label, value, scope, statSource);
    return item && !(Number(value) === 0 && !["Goals", "Assists", "Red cards"].includes(label)) ? [item] : [];
  });
}

async function syncCurrentFootball(seed) {
  const season = String(seed.providerSeason ?? 2024);
  const payload = await footballJson("players", {
    search: seed.providerQuery ?? seed.name,
    season,
    league: String(seed.providerLeagueId),
  });
  const candidates = Array.isArray(payload.response) ? payload.response : [];
  const record = candidates.toSorted((a, b) => playerMatchScore(seed, b.player) - playerMatchScore(seed, a.player))[0];
  if (!record?.player?.id || playerMatchScore(seed, record.player) < 10) throw new Error(`No reliable API-Football match for ${seed.name}`);
  const stats = footballStats(record.statistics, season);
  if (stats.length < 4) throw new Error(`Insufficient API-Football statistics for ${seed.name}`);
  return {
    providerId: String(record.player.id),
    imageUrl: record.player.photo,
    verifiedAt,
    profile: {
      dateOfBirth: record.player.birth?.date ?? null,
      placeOfBirth: record.player.birth?.place ?? null,
      height: record.player.height ?? null,
      weight: record.player.weight ?? null,
      providerRole: record.player.position ?? null,
    },
    stats,
  };
}

function syncFootballLegend(seed) {
  const [caps, goals, worldCups, championsLeagues] = seed.career;
  const slug = encodeURIComponent(seed.name.replaceAll(" ", "_"));
  const statSource = source("Verified career record", `https://en.wikipedia.org/wiki/${slug}`);
  return {
    verifiedAt,
    profile: { providerRole: "Retired icon" },
    stats: [
      stat("International caps", caps, "Senior international career", statSource),
      stat("International goals", goals, "Senior international career", statSource),
      stat("FIFA World Cups", worldCups, "Career honours", statSource),
      stat("UEFA Champions Leagues", championsLeagues, "Career honours", statSource),
    ].filter(Boolean),
  };
}

const selected = seeds.filter((seed) => !sportFilter || seed.sport === sportFilter).slice(offset, offset + limit);
const failures = [];
async function processSeed(seed) {
  try {
    const record = seed.sport === "cricket"
      ? await syncCricket(seed)
      : seed.era === "legend"
        ? syncFootballLegend(seed)
        : await syncCurrentFootball(seed);
    output[seed.id] = record;
    console.log(`Synced ${seed.id} · ${seed.name} · ${record.stats.length} stats`);
    if (seed.sport === "football" && seed.era === "current") {
      await new Promise((resolveWait) => setTimeout(resolveWait, 6_200));
    }
  } catch (error) {
    failures.push(`${seed.id}: ${error instanceof Error ? error.message : String(error)}`);
    console.error(`FAILED ${seed.id} · ${seed.name}`);
  }
}

if (selected.every((seed) => seed.sport === "cricket")) {
  let cursor = 0;
  const workerCount = Math.min(Number(process.env.BIDARENA_SYNC_CONCURRENCY ?? 5), selected.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (cursor < selected.length) {
      const seed = selected[cursor];
      cursor += 1;
      await processSeed(seed);
    }
  }));
} else {
  for (const seed of selected) await processSeed(seed);
}

await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Wrote ${selected.length} verified player records to ${outputPath}`);
}
