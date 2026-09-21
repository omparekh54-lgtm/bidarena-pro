import type { AthleteEra, Sport } from "@/lib/auction/types";

export type SupplementalPlayerSeed = {
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
  gameRating: number;
  basePrice: number;
};

export const supplementalFootballStars: SupplementalPlayerSeed[] = [
  {
    id: "football-current-messi",
    sport: "football",
    era: "current",
    name: "Lionel Messi",
    shortName: "L. Messi",
    country: "Argentina",
    team: "Inter Miami",
    role: "Forward / attacking midfielder",
    secondaryRole: "Left-footed playmaker",
    metrics: ["ARG", "FWD", "LFP", "ICON"],
    gameRating: 98,
    basePrice: 50,
  },
  {
    id: "football-current-ronaldo",
    sport: "football",
    era: "current",
    name: "Cristiano Ronaldo",
    shortName: "C. Ronaldo",
    country: "Portugal",
    team: "Al-Nassr",
    role: "Forward",
    secondaryRole: "Right-footed goalscorer",
    metrics: ["POR", "FWD", "RFG", "ICON"],
    gameRating: 97,
    basePrice: 50,
  },
];
