import { readFile, writeFile } from "node:fs/promises";

const path = new URL("../src/data/player-seeds.json", import.meta.url);
const storedSeeds = JSON.parse(await readFile(path, "utf8"));
// Rebuild only generated entries so this script remains deterministic and idempotent.
const seeds = storedSeeds.filter((seed) => !seed.id.startsWith("catalog-"));
const targetPerEra = 300;

const firstNames = [
  "Aarav", "Adrian", "Ahmed", "Alejandro", "Andre", "Arjun", "Benjamin", "Bruno", "Carlos", "Daniel",
  "David", "Elias", "Emmanuel", "Ethan", "Felix", "Gabriel", "Hassan", "Hugo", "Ibrahim", "Isaac",
  "Ivan", "Jack", "James", "Javier", "Jayden", "Jonas", "Joseph", "Kai", "Karim", "Liam",
  "Luca", "Marco", "Mateo", "Mohammed", "Nathan", "Nikhil", "Noah", "Oliver", "Omar", "Oscar",
  "Rafael", "Rayan", "Reece", "Rohan", "Samuel", "Santiago", "Theo", "Thomas", "Victor", "Yusuf",
];
const lastNames = [
  "Adams", "Ahmed", "Alvarez", "Anderson", "Bennett", "Campbell", "Carvalho", "Chaudhary", "Costa", "Das",
  "Davies", "Fernandes", "Garcia", "Gomes", "Gupta", "Harris", "Hernandez", "Ibrahim", "Jackson", "Johnson",
  "Khan", "Kumar", "Lewis", "Lopez", "Martin", "Martinez", "Mehta", "Mendes", "Miller", "Mitchell",
  "Morgan", "Morris", "Nair", "Patel", "Pereira", "Rahman", "Reyes", "Roberts", "Rodriguez", "Santos",
  "Sharma", "Silva", "Singh", "Smith", "Taylor", "Thomas", "Walker", "Williams", "Wilson", "Young",
];

const cricketNations = [
  ["India", "IND"], ["Australia", "AUS"], ["England", "ENG"], ["South Africa", "RSA"],
  ["New Zealand", "NZ"], ["Pakistan", "PAK"], ["West Indies", "WI"], ["Sri Lanka", "SL"],
  ["Bangladesh", "BAN"], ["Afghanistan", "AFG"], ["Ireland", "IRE"], ["Zimbabwe", "ZIM"],
];
const footballNations = [
  ["England", "ENG"], ["Spain", "ESP"], ["France", "FRA"], ["Germany", "GER"], ["Italy", "ITA"],
  ["Brazil", "BRA"], ["Argentina", "ARG"], ["Portugal", "POR"], ["Netherlands", "NED"], ["Belgium", "BEL"],
  ["Croatia", "CRO"], ["Morocco", "MAR"], ["Japan", "JPN"], ["South Korea", "KOR"], ["Nigeria", "NGA"],
];
const cricketRoles = [
  ["Top-order batter", "Right-hand bat", "BAT", "RHB"],
  ["Opening batter", "Left-hand bat", "OPN", "LHB"],
  ["Middle-order batter", "Right-hand bat", "MID", "RHB"],
  ["Wicketkeeper-batter", "Right-hand bat", "WK", "RHB"],
  ["Fast bowler", "Right-arm fast", "PACE", "RAF"],
  ["Fast bowler", "Left-arm fast", "PACE", "LAF"],
  ["Spin bowler", "Leg-spin", "SPIN", "LBG"],
  ["Spin bowler", "Off-spin", "SPIN", "OB"],
  ["All-rounder", "Right-arm fast-medium", "AR", "RFM"],
  ["All-rounder", "Slow left-arm orthodox", "AR", "SLA"],
];
const footballRoles = [
  ["GK", "Sweeper keeper"], ["CB", "Defender"], ["FB", "Wing-back"], ["CDM", "CM"],
  ["CM", "CAM"], ["CAM", "CM"], ["LW", "ST"], ["RW", "ST"], ["CF", "ST"], ["ST", "CF"],
];

function addPool(sport, era) {
  const existing = seeds.filter((seed) => seed.sport === sport && seed.era === era).length;
  const nations = sport === "cricket" ? cricketNations : footballNations;
  for (let index = existing + 1; index <= targetPerEra; index += 1) {
    const first = firstNames[(index * 7 + (era === "legend" ? 11 : 0)) % firstNames.length];
    const last = lastNames[(index * 13 + (sport === "football" ? 17 : 0) + (era === "legend" ? 19 : 0)) % lastNames.length];
    const generation = Math.floor((index - 1) / firstNames.length);
    const middle = generation ? ` ${String.fromCharCode(64 + generation)}.` : "";
    const name = `${first}${middle} ${last}`;
    const [country, countryCode] = nations[index % nations.length];
    const suffix = era === "legend" ? "Heritage" : "National XI";
    if (sport === "cricket") {
      const [role, secondaryRole, roleCode, style] = cricketRoles[index % cricketRoles.length];
      seeds.push({
        id: `catalog-cricket-${era}-${String(index).padStart(3, "0")}`,
        sport, era, name, shortName: `${first[0]}.${middle} ${last}`.replace("..", "."), country,
        team: `${country} ${suffix}`, role, secondaryRole,
        metrics: [countryCode, roleCode, style, era === "legend" ? "ICON" : "INTL"],
      });
    } else {
      const [role, secondaryRole] = footballRoles[index % footballRoles.length];
      seeds.push({
        id: `catalog-football-${era}-${String(index).padStart(3, "0")}`,
        sport, era, name, shortName: `${first[0]}.${middle} ${last}`.replace("..", "."), country,
        team: `${country} ${suffix}`, role, secondaryRole,
        metrics: [role, secondaryRole, index % 3 === 0 ? "L" : "R", countryCode],
      });
    }
  }
}

for (const sport of ["cricket", "football"]) {
  for (const era of ["current", "legend"]) addPool(sport, era);
}

const ids = seeds.map((seed) => seed.id);
if (new Set(ids).size !== ids.length) throw new Error("Catalog expansion produced duplicate IDs.");
await writeFile(path, `[\n${seeds.map((seed) => `  ${JSON.stringify(seed)}`).join(",\n")}\n]\n`);
