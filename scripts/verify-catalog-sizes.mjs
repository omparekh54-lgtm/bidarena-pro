import { readFile } from "node:fs/promises";

const seeds = JSON.parse(await readFile(new URL("../src/data/player-seeds.json", import.meta.url), "utf8"));
const approvedNames = JSON.parse(await readFile(new URL("../src/data/verified-real-player-names.json", import.meta.url), "utf8"));

const normalizeName = (value) => String(value)
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/gi, " ")
  .trim()
  .toLowerCase();

const expectedCounts = {
  "cricket-current": 100,
  "cricket-legend": 100,
  "football-current": 100,
  "football-legend": 100,
};

const ids = seeds.map((seed) => seed.id);
if (new Set(ids).size !== ids.length) throw new Error("Player catalog contains duplicate IDs.");

const normalizedNames = seeds.map((seed) => normalizeName(seed.name));
if (new Set(normalizedNames).size !== normalizedNames.length) {
  const duplicates = normalizedNames.filter((name, index) => normalizedNames.indexOf(name) !== index);
  throw new Error(`Player catalog contains duplicate names: ${[...new Set(duplicates)].join(", ")}`);
}

const approved = new Set(approvedNames.map(normalizeName));
if (approved.size !== approvedNames.length) throw new Error("Approved real-player manifest contains duplicate names.");
if (approved.size !== 400) throw new Error(`Approved real-player manifest must contain exactly 400 names, found ${approved.size}.`);

for (const seed of seeds) {
  const text = [seed.id, seed.name, seed.shortName, seed.country, seed.team, seed.role, seed.secondaryRole ?? ""].join(" ");
  if (/\b(catalog|generated|fictional|placeholder|filler|fake)\b/i.test(text)) {
    throw new Error(`Generated/filler marker found in player seed: ${seed.name}`);
  }
  if (!approved.has(normalizeName(seed.name))) {
    throw new Error(`Player is not present in the approved real-player manifest: ${seed.name}`);
  }
}

if (seeds.length !== 400) throw new Error(`Expected exactly 400 real players, found ${seeds.length}.`);

for (const [key, expected] of Object.entries(expectedCounts)) {
  const [sport, era] = key.split("-");
  const athletes = seeds.filter((seed) => seed.sport === sport && seed.era === era);
  if (athletes.length !== expected) throw new Error(`${key}: expected ${expected}, found ${athletes.length}`);
  if (athletes.some((seed) => !seed.id || !seed.name || !seed.shortName || !seed.country || !seed.team || !seed.role || !Array.isArray(seed.metrics) || seed.metrics.length !== 4)) {
    throw new Error(`${key} contains a malformed player seed.`);
  }
}

const roleChecks = {
  football: [
    ["GK", (seed) => seed.role === "GK" || seed.secondaryRole === "GK"],
    ["CB", (seed) => seed.role === "CB" || seed.secondaryRole === "CB"],
    ["full-back", (seed) => /\bL[WB]?B\b|\bR[WB]?B\b/i.test(`${seed.role} ${seed.secondaryRole ?? ""}`)],
    ["CDM", (seed) => /\bCDM\b/i.test(`${seed.role} ${seed.secondaryRole ?? ""}`)],
    ["CM", (seed) => /\bCM\b/i.test(`${seed.role} ${seed.secondaryRole ?? ""}`)],
    ["CAM", (seed) => /\bCAM\b/i.test(`${seed.role} ${seed.secondaryRole ?? ""}`)],
    ["winger", (seed) => /\bL[WR]\b|\bR[WR]\b/i.test(`${seed.role} ${seed.secondaryRole ?? ""}`)],
    ["striker/CF", (seed) => /\bST\b|\bCF\b/i.test(`${seed.role} ${seed.secondaryRole ?? ""}`)],
  ],
  cricket: [
    ["opener", (seed) => /opening/i.test(seed.role)],
    ["top-order", (seed) => /top-order/i.test(seed.role)],
    ["middle-order", (seed) => /middle-order/i.test(seed.role)],
    ["wicketkeeper", (seed) => /wicketkeeper/i.test(seed.role)],
    ["pace", (seed) => /fast bowler/i.test(seed.role)],
    ["spin", (seed) => /spin bowler/i.test(seed.role)],
    ["all-rounder", (seed) => /all-rounder/i.test(seed.role)],
  ],
};

for (const [sport, checks] of Object.entries(roleChecks)) {
  const athletes = seeds.filter((seed) => seed.sport === sport);
  for (const [label, predicate] of checks) {
    const count = athletes.filter(predicate).length;
    if (count < 5) throw new Error(`${sport} role coverage is too thin for ${label}: ${count}`);
  }
}

for (const sport of ["cricket", "football"]) {
  const current = seeds.filter((seed) => seed.sport === sport && seed.era === "current").length;
  const legends = seeds.filter((seed) => seed.sport === sport && seed.era === "legend").length;
  console.log(`${sport}/current: ${current}`);
  console.log(`${sport}/legends: ${legends}`);
  console.log(`${sport}/mixed: ${current + legends}`);
}
console.log("Verified real-player catalog: 400 unique names, 100 per sport/era, no generated IDs or filler markers.");
