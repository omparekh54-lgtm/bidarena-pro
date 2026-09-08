import { readFile } from "node:fs/promises";

const seeds = JSON.parse(await readFile(new URL("../src/data/player-seeds.json", import.meta.url), "utf8"));
const ids = seeds.map((seed) => seed.id);
if (new Set(ids).size !== ids.length) throw new Error("Player catalog contains duplicate IDs.");

for (const sport of ["cricket", "football"]) {
  const current = seeds.filter((seed) => seed.sport === sport && seed.era === "current").length;
  const legends = seeds.filter((seed) => seed.sport === sport && seed.era === "legend").length;
  const mixed = current + legends;
  for (const [mode, count] of [["current", current], ["legends", legends], ["mixed", mixed]]) {
    if (count < 300) throw new Error(`${sport}/${mode} has ${count} athletes; at least 300 are required.`);
    console.log(`${sport}/${mode}: ${count}`);
  }
}
