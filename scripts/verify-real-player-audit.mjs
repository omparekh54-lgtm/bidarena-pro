import { readFile } from "node:fs/promises";

const seeds = JSON.parse(await readFile(new URL("../src/data/player-seeds.json", import.meta.url), "utf8"));
const manifest = JSON.parse(await readFile(new URL("../src/data/verified-real-player-names.json", import.meta.url), "utf8"));
const audit = JSON.parse(await readFile(new URL("../src/data/player-catalog-audit.json", import.meta.url), "utf8"));

const normalizeName = (value) => String(value)
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/gi, " ")
  .trim()
  .toLowerCase();

const expected = {
  "cricket-current": 100,
  "cricket-legend": 100,
  "football-current": 100,
  "football-legend": 100,
};

if (audit.status !== "passed") throw new Error("Player catalog audit is not marked as passed.");
if (audit.auditVersion !== 2) throw new Error(`Unexpected player catalog audit version: ${audit.auditVersion}`);
if (audit.result.fictionalPlayersFound !== 0) throw new Error("Audit reports fictional players.");
if (audit.result.placeholderPlayersFound !== 0) throw new Error("Audit reports placeholder players.");
if (audit.result.generatedPlayersFound !== 0) throw new Error("Audit reports generated players.");
if (audit.result.duplicateIdentitiesFound !== 0) throw new Error("Audit reports duplicate identities.");
if (audit.result.replacementsRequired !== 0) throw new Error("Audit reports unresolved player replacements.");

const seedNames = seeds.map((seed) => normalizeName(seed.name));
const manifestNames = manifest.map((name) => normalizeName(name));
if (manifest.length !== 400) throw new Error(`Real-player manifest must contain 400 names, found ${manifest.length}.`);
if (new Set(manifestNames).size !== manifestNames.length) throw new Error("Real-player manifest contains duplicate identities.");
if (new Set(seedNames).size !== seedNames.length) throw new Error("Player catalog contains duplicate identities.");

const manifestSet = new Set(manifestNames);
for (const seed of seeds) {
  if (!manifestSet.has(normalizeName(seed.name))) throw new Error(`Unapproved player found: ${seed.name}`);
}

for (const [key, count] of Object.entries(expected)) {
  const [sport, era] = key.split("-");
  const actual = seeds.filter((seed) => seed.sport === sport && seed.era === era).length;
  if (actual !== count) throw new Error(`${key}: expected ${count}, found ${actual}`);
  if (audit.catalogCounts[key] !== count) throw new Error(`Audit count mismatch for ${key}.`);
}

if (audit.catalogCounts.total !== 400 || seeds.length !== 400) throw new Error("Catalog total must remain exactly 400.");

console.log("Real-player audit passed: 400 unique catalog identities, 0 fictional/generated/placeholder players, 0 unresolved replacements.");
