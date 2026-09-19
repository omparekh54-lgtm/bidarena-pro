import { readFile } from "node:fs/promises";

const seeds = JSON.parse(await readFile(new URL("../src/data/player-seeds.json", import.meta.url), "utf8"));
const identities = JSON.parse(await readFile(new URL("../src/data/player-identities.json", import.meta.url), "utf8"));
const normalize = (name) => name.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const identityById = new Map(identities.map((identity) => [identity.id, identity]));
const ids = new Set();
const names = new Set();
const sources = new Set();
if (identityById.size !== identities.length || identities.length !== seeds.length) throw new Error("Identity register must match the catalog one-to-one.");
for (const seed of seeds) {
  if (!/^(cricket|football)-(legend-)?\d+$/.test(seed.id) || seed.id.startsWith("catalog-")) throw new Error(`Generated or invalid player ID: ${seed.id}`);
  if (ids.has(seed.id)) throw new Error(`Duplicate player ID: ${seed.id}`);
  ids.add(seed.id);
  const key = `${seed.sport}:${normalize(seed.name)}`;
  if (names.has(key)) throw new Error(`Duplicate player name: ${seed.name}`);
  names.add(key);
  const identity = identityById.get(seed.id);
  // This is a reviewed identity allowlist, not an automated claim that a name is real.
  if (!identity || identity.name !== seed.name || identity.sport !== seed.sport) throw new Error(`Unreviewed player identity: ${seed.name}`);
  const source = new URL(identity.sourceUrl);
  if (source.protocol !== "https:" || source.hostname !== "en.wikipedia.org" || !source.pathname.startsWith("/wiki/")) throw new Error(`Missing identity reference: ${seed.name}`);
  if (sources.has(identity.sourceUrl)) throw new Error(`Duplicate identity reference: ${seed.name}`);
  sources.add(identity.sourceUrl);
  if (!["current", "legend"].includes(seed.era) || !["cricket", "football"].includes(seed.sport)) throw new Error(`Invalid pool: ${seed.id}`);
  if (!seed.id.startsWith(`${seed.sport}-${seed.era === "legend" ? "legend-" : ""}`)) throw new Error(`ID does not match pool: ${seed.id}`);
  if (![seed.name, seed.shortName, seed.country, seed.team, seed.role].every((v) => typeof v === "string" && v.trim()) || seed.metrics.length !== 4 || !seed.metrics.every((v) => typeof v === "string" && v)) throw new Error(`Invalid seed fields: ${seed.id}`);
}
for (const sport of ["cricket", "football"]) {
  for (const era of ["current", "legend"]) {
    const pool = seeds.filter((seed) => seed.sport === sport && seed.era === era);
    if (pool.length !== 100) throw new Error(`${sport}/${era}: expected 100, received ${pool.length}`);
    const roles = sport === "football" ? ["GK", "CB", "LB", "RB", "CDM", "CM", "CAM", "LW", "RW", "ST", "CF"] : ["Opening batter", "Top-order batter", "Middle-order batter", "Wicketkeeper-batter", "Fast bowler", "Spin bowler", "All-rounder"];
    for (const role of roles) if (!pool.some((p) => p.role === role || p.secondaryRole === role)) throw new Error(`${sport}/${era} missing role: ${role}`);
    if (new Set(pool.map((p) => p.country)).size < 8) throw new Error(`${sport}/${era} needs broader country representation`);
    console.log(`${sport}/${era}: ${pool.length}`);
  }
  console.log(`${sport}/mixed: 200`);
}
console.log("400 reviewed identities; no duplicate names, IDs, identity references, or generated fillers.");
