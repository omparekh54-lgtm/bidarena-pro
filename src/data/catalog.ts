import type { Athlete, AthleteEra, AthleteStat, Sport } from "@/lib/auction/types";
import generatedPlayerData from "./generated/player-stats.json";
import playerSeeds from "./player-seeds.json";
import { supplementalFootballStars } from "./supplemental-football-stars";

type PlayerSeed = {
  id: string;
  sport: Sport;
  era: AthleteEra;
  name: string;
  shortName: string;
  country: string;
  team: string;
  role: string;
  secondaryRole?: string;
  metrics: [string, string, string, string];
};

type GeneratedPlayerRecord = {
  providerId?: string;
  imageUrl?: string;
  verifiedAt?: string;
  stats?: AthleteStat[];
};

const records = generatedPlayerData as Record<string, GeneratedPlayerRecord>;

function buildAthlete(seed: PlayerSeed, index: number): Athlete {
  const record = records[seed.id];
  const sportIndex = (playerSeeds as PlayerSeed[]).filter((candidate) => candidate.sport === seed.sport && candidate.era === seed.era).findIndex((candidate) => candidate.id === seed.id);
  const legendPremium = seed.era === "legend" ? (seed.sport === "cricket" ? 100 : 20) : 0;
  return {
    ...seed,
    basePrice: seed.sport === "cricket" ? 50 + (sportIndex % 5) * 25 + legendPremium : 10 + (sportIndex % 6) * 5 + legendPremium,
    gameRating: seed.era === "legend" ? 91 + ((index + 3) % 9) : 84 + ((index + 5) % 8),
    accent: seed.era === "legend" ? "#d6b66d" : seed.sport === "cricket" ? "#f4b941" : "#56e0c4",
    imageUrl: record?.imageUrl,
    providerId: record?.providerId,
    source: {
      provider: record?.providerId ? (seed.sport === "cricket" ? "CricketData.org" : "API-Football") : "Curated profile",
      kind: "identity",
      verifiedAt: record?.verifiedAt,
    },
    identity: seed.metrics.map((value, metricIndex) => ({
      label: ["PRIMARY", "SECONDARY", seed.sport === "football" ? "FOOT" : "STYLE", seed.era === "legend" ? "CLASS" : "COUNTRY"][metricIndex],
      value,
    })),
    realStats: record?.stats ?? [],
  };
}

const baseAthleteCatalog: Athlete[] = (playerSeeds as PlayerSeed[]).map(buildAthlete);

const supplementalAthleteCatalog: Athlete[] = supplementalFootballStars.map((seed) => ({
  id: seed.id,
  sport: seed.sport,
  era: seed.era,
  name: seed.name,
  shortName: seed.shortName,
  country: seed.country,
  team: seed.team,
  role: seed.role,
  secondaryRole: seed.secondaryRole,
  metrics: seed.metrics,
  basePrice: seed.basePrice,
  gameRating: seed.gameRating,
  accent: "#56e0c4",
  imageUrl: undefined,
  providerId: undefined,
  source: {
    provider: "Curated profile",
    kind: "identity",
  },
  identity: seed.metrics.map((value, metricIndex) => ({
    label: ["PRIMARY", "SECONDARY", "FOOT", "CLASS"][metricIndex],
    value,
  })),
  realStats: [],
}));

export const athleteCatalog: Athlete[] = [...baseAthleteCatalog, ...supplementalAthleteCatalog];

export function athletesForPool(sport: Sport, mode: "current" | "legends" | "mixed") {
  return athleteCatalog.filter((athlete) => athlete.sport === sport && (
    mode === "mixed" || (mode === "current" ? athlete.era === "current" : athlete.era === "legend")
  ));
}
