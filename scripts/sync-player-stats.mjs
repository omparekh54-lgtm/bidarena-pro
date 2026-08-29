import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bindingsPath = resolve(root, process.env.BIDARENA_BINDINGS_FILE ?? "src/data/provider-bindings.json");
const outputPath = resolve(root, "src/data/generated/player-stats.json");
const footballKey = process.env.API_FOOTBALL_KEY;
const cricketKey = process.env.CRICKETDATA_API_KEY;

function asValue(value) {
  return value === null || value === undefined || value === "" ? null : String(value);
}

function footballStats(payload, binding, verifiedAt) {
  const record = payload?.response?.[0];
  const stats = record?.statistics?.find((entry) => Number(entry?.league?.id) === Number(binding.leagueId)) ?? record?.statistics?.[0];
  if (!stats) throw new Error("API-Football returned no matching statistics record");
  const scope = `${stats.league?.name ?? `League ${binding.leagueId}`} · ${stats.league?.season ?? binding.season}`;
  const source = { provider: "API-Football", kind: "performance", sourceUrl: "https://api-sports.io/documentation/football/v3", verifiedAt };
  const values = [
    ["Appearances", stats.games?.appearences],
    ["Minutes", stats.games?.minutes],
    ["Goals", stats.goals?.total],
    ["Assists", stats.goals?.assists],
    ["Rating", stats.games?.rating],
  ];
  return values.flatMap(([label, value]) => asValue(value) === null ? [] : [{ label, value: asValue(value), scope, source }]);
}

function cricketStats(payload, verifiedAt) {
  const records = payload?.data?.stats;
  if (!Array.isArray(records)) throw new Error("CricketData.org returned no player statistics array");
  const source = { provider: "CricketData.org", kind: "performance", sourceUrl: "https://cricketdata.org/", verifiedAt };
  return records.flatMap((record) => {
    const value = asValue(record?.value);
    if (value === null || !record?.stat) return [];
    const format = String(record.matchtype ?? "career").toUpperCase();
    const discipline = String(record.fn ?? "career").replaceAll("_", " ");
    return [{ label: String(record.stat).replaceAll("_", " "), value, scope: `${format} · ${discipline}`, source }];
  });
}

async function requestFootball(binding) {
  if (!footballKey) throw new Error("API_FOOTBALL_KEY is not configured");
  const query = new URLSearchParams({ id: String(binding.playerId), league: String(binding.leagueId), season: String(binding.season) });
  const response = await fetch(`https://v3.football.api-sports.io/players?${query}`, { headers: { "x-apisports-key": footballKey } });
  if (!response.ok) throw new Error(`API-Football request failed (${response.status})`);
  const payload = await response.json();
  if (payload?.errors && Object.keys(payload.errors).length) throw new Error(`API-Football provider error: ${JSON.stringify(payload.errors)}`);
  return payload;
}

async function requestCricket(binding) {
  if (!cricketKey) throw new Error("CRICKETDATA_API_KEY is not configured");
  const query = new URLSearchParams({ apikey: cricketKey, id: String(binding.playerId) });
  const response = await fetch(`https://api.cricapi.com/v1/players_info?${query}`);
  if (!response.ok) throw new Error(`CricketData.org request failed (${response.status})`);
  const payload = await response.json();
  if (payload?.status && payload.status !== "success") throw new Error(`CricketData.org provider error: ${payload.reason ?? payload.status}`);
  return payload;
}

const bindings = JSON.parse(await readFile(bindingsPath, "utf8"));
let output = {};
try {
  output = JSON.parse(await readFile(outputPath, "utf8"));
} catch {
  // The first successful synchronization creates the generated cache.
}

const limit = Number(process.env.BIDARENA_SYNC_LIMIT ?? 20);
let processed = 0;
for (const [athleteId, binding] of Object.entries(bindings)) {
  if (processed >= limit) break;
  const verifiedAt = new Date().toISOString();
  if (binding.provider === "API-Football") {
    output[athleteId] = footballStats(await requestFootball(binding), binding, verifiedAt);
  } else if (binding.provider === "CricketData.org") {
    output[athleteId] = cricketStats(await requestCricket(binding), verifiedAt);
  } else {
    throw new Error(`Unsupported provider for ${athleteId}`);
  }
  processed += 1;
  console.log(`Synced ${athleteId} from ${binding.provider}`);
}

await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`Wrote ${processed} verified player records to ${outputPath}`);
