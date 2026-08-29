import type { Athlete } from "@/lib/auction/types";
import generatedStats from "./generated/player-stats.json";

type Seed = Omit<Athlete, "id" | "sport" | "basePrice" | "gameRating" | "accent" | "identity" | "realStats" | "source"> & {
  metrics: [string, string, string, string];
};

const cricket: Seed[] = [
  { name: "Virat Kohli", shortName: "V. Kohli", country: "India", team: "India", role: "Top-order batter", secondaryRole: "Right-hand bat", metrics: ["IND", "BAT", "RHB", "INTL"] },
  { name: "Rohit Sharma", shortName: "R. Sharma", country: "India", team: "India", role: "Opening batter", secondaryRole: "Right-hand bat", metrics: ["IND", "OPN", "RHB", "INTL"] },
  { name: "Jasprit Bumrah", shortName: "J. Bumrah", country: "India", team: "India", role: "Fast bowler", secondaryRole: "Right-arm fast", metrics: ["IND", "PACE", "RAF", "INTL"] },
  { name: "Hardik Pandya", shortName: "H. Pandya", country: "India", team: "India", role: "All-rounder", secondaryRole: "Right-arm fast-medium", metrics: ["IND", "AR", "RFM", "INTL"] },
  { name: "Rishabh Pant", shortName: "R. Pant", country: "India", team: "India", role: "Wicketkeeper-batter", secondaryRole: "Left-hand bat", metrics: ["IND", "WK", "LHB", "INTL"] },
  { name: "Shubman Gill", shortName: "S. Gill", country: "India", team: "India", role: "Top-order batter", secondaryRole: "Right-hand bat", metrics: ["IND", "BAT", "RHB", "INTL"] },
  { name: "Suryakumar Yadav", shortName: "S. Yadav", country: "India", team: "India", role: "Middle-order batter", secondaryRole: "Right-hand bat", metrics: ["IND", "MID", "RHB", "T20"] },
  { name: "Ravindra Jadeja", shortName: "R. Jadeja", country: "India", team: "India", role: "All-rounder", secondaryRole: "Left-arm orthodox", metrics: ["IND", "AR", "SLA", "INTL"] },
  { name: "Travis Head", shortName: "T. Head", country: "Australia", team: "Australia", role: "Opening batter", secondaryRole: "Left-hand bat", metrics: ["AUS", "OPN", "LHB", "INTL"] },
  { name: "Pat Cummins", shortName: "P. Cummins", country: "Australia", team: "Australia", role: "Fast bowler", secondaryRole: "Right-arm fast", metrics: ["AUS", "PACE", "RAF", "INTL"] },
  { name: "Glenn Maxwell", shortName: "G. Maxwell", country: "Australia", team: "Australia", role: "All-rounder", secondaryRole: "Off-spin", metrics: ["AUS", "AR", "OB", "T20"] },
  { name: "Mitchell Starc", shortName: "M. Starc", country: "Australia", team: "Australia", role: "Fast bowler", secondaryRole: "Left-arm fast", metrics: ["AUS", "PACE", "LAF", "INTL"] },
  { name: "Jos Buttler", shortName: "J. Buttler", country: "England", team: "England", role: "Wicketkeeper-batter", secondaryRole: "Right-hand bat", metrics: ["ENG", "WK", "RHB", "T20"] },
  { name: "Ben Stokes", shortName: "B. Stokes", country: "England", team: "England", role: "All-rounder", secondaryRole: "Left-hand bat", metrics: ["ENG", "AR", "LHB", "INTL"] },
  { name: "Rashid Khan", shortName: "R. Khan", country: "Afghanistan", team: "Afghanistan", role: "Spin bowler", secondaryRole: "Leg-spin", metrics: ["AFG", "SPIN", "LBG", "T20"] },
  { name: "Kagiso Rabada", shortName: "K. Rabada", country: "South Africa", team: "South Africa", role: "Fast bowler", secondaryRole: "Right-arm fast", metrics: ["RSA", "PACE", "RAF", "INTL"] },
  { name: "Heinrich Klaasen", shortName: "H. Klaasen", country: "South Africa", team: "South Africa", role: "Wicketkeeper-batter", secondaryRole: "Right-hand bat", metrics: ["RSA", "WK", "RHB", "T20"] },
  { name: "Babar Azam", shortName: "B. Azam", country: "Pakistan", team: "Pakistan", role: "Top-order batter", secondaryRole: "Right-hand bat", metrics: ["PAK", "BAT", "RHB", "INTL"] },
  { name: "Shaheen Shah Afridi", shortName: "S. Afridi", country: "Pakistan", team: "Pakistan", role: "Fast bowler", secondaryRole: "Left-arm fast", metrics: ["PAK", "PACE", "LAF", "INTL"] },
  { name: "Nicholas Pooran", shortName: "N. Pooran", country: "West Indies", team: "West Indies", role: "Wicketkeeper-batter", secondaryRole: "Left-hand bat", metrics: ["WI", "WK", "LHB", "T20"] },
  { name: "Yashasvi Jaiswal", shortName: "Y. Jaiswal", country: "India", team: "India", role: "Opening batter", secondaryRole: "Left-hand bat", metrics: ["IND", "OPN", "LHB", "INTL"] },
  { name: "KL Rahul", shortName: "K. Rahul", country: "India", team: "India", role: "Wicketkeeper-batter", secondaryRole: "Right-hand bat", metrics: ["IND", "WK", "RHB", "INTL"] },
  { name: "Abhishek Sharma", shortName: "A. Sharma", country: "India", team: "India", role: "Opening batter", secondaryRole: "Left-hand bat", metrics: ["IND", "OPN", "LHB", "T20"] },
  { name: "Shreyas Iyer", shortName: "S. Iyer", country: "India", team: "India", role: "Middle-order batter", secondaryRole: "Right-hand bat", metrics: ["IND", "MID", "RHB", "INTL"] },
  { name: "Ruturaj Gaikwad", shortName: "R. Gaikwad", country: "India", team: "India", role: "Opening batter", secondaryRole: "Right-hand bat", metrics: ["IND", "OPN", "RHB", "T20"] },
  { name: "Steve Smith", shortName: "S. Smith", country: "Australia", team: "Australia", role: "Top-order batter", secondaryRole: "Right-hand bat", metrics: ["AUS", "BAT", "RHB", "INTL"] },
  { name: "Joe Root", shortName: "J. Root", country: "England", team: "England", role: "Top-order batter", secondaryRole: "Right-hand bat", metrics: ["ENG", "BAT", "RHB", "INTL"] },
  { name: "Kane Williamson", shortName: "K. Williamson", country: "New Zealand", team: "New Zealand", role: "Top-order batter", secondaryRole: "Right-hand bat", metrics: ["NZ", "BAT", "RHB", "INTL"] },
  { name: "Quinton de Kock", shortName: "Q. de Kock", country: "South Africa", team: "South Africa", role: "Wicketkeeper-batter", secondaryRole: "Left-hand bat", metrics: ["RSA", "WK", "LHB", "T20"] },
  { name: "Devon Conway", shortName: "D. Conway", country: "New Zealand", team: "New Zealand", role: "Wicketkeeper-batter", secondaryRole: "Left-hand bat", metrics: ["NZ", "WK", "LHB", "INTL"] },
  { name: "Josh Hazlewood", shortName: "J. Hazlewood", country: "Australia", team: "Australia", role: "Fast bowler", secondaryRole: "Right-arm fast-medium", metrics: ["AUS", "PACE", "RFM", "INTL"] },
  { name: "Trent Boult", shortName: "T. Boult", country: "New Zealand", team: "New Zealand", role: "Fast bowler", secondaryRole: "Left-arm fast", metrics: ["NZ", "PACE", "LAF", "T20"] },
  { name: "Kuldeep Yadav", shortName: "K. Yadav", country: "India", team: "India", role: "Spin bowler", secondaryRole: "Left-arm wrist-spin", metrics: ["IND", "SPIN", "LWS", "INTL"] },
  { name: "Adam Zampa", shortName: "A. Zampa", country: "Australia", team: "Australia", role: "Spin bowler", secondaryRole: "Leg-spin", metrics: ["AUS", "SPIN", "LBG", "INTL"] },
];

const football: Seed[] = [
  { name: "Kylian Mbappé", shortName: "K. Mbappé", country: "France", team: "Real Madrid", role: "ST", secondaryRole: "LW", metrics: ["ST", "LW", "R", "FRA"] },
  { name: "Erling Haaland", shortName: "E. Haaland", country: "Norway", team: "Manchester City", role: "ST", metrics: ["ST", "CF", "L", "NOR"] },
  { name: "Vinícius Júnior", shortName: "V. Júnior", country: "Brazil", team: "Real Madrid", role: "LW", secondaryRole: "ST", metrics: ["LW", "ST", "R", "BRA"] },
  { name: "Jude Bellingham", shortName: "J. Bellingham", country: "England", team: "Real Madrid", role: "CAM", secondaryRole: "CM", metrics: ["CAM", "CM", "R", "ENG"] },
  { name: "Mohamed Salah", shortName: "M. Salah", country: "Egypt", team: "Liverpool", role: "RW", secondaryRole: "ST", metrics: ["RW", "ST", "L", "EGY"] },
  { name: "Rodri", shortName: "Rodri", country: "Spain", team: "Manchester City", role: "CDM", secondaryRole: "CM", metrics: ["CDM", "CM", "R", "ESP"] },
  { name: "Lamine Yamal", shortName: "L. Yamal", country: "Spain", team: "Barcelona", role: "RW", secondaryRole: "LW", metrics: ["RW", "LW", "L", "ESP"] },
  { name: "Harry Kane", shortName: "H. Kane", country: "England", team: "Bayern Munich", role: "ST", secondaryRole: "CF", metrics: ["ST", "CF", "R", "ENG"] },
  { name: "Florian Wirtz", shortName: "F. Wirtz", country: "Germany", team: "Liverpool", role: "CAM", secondaryRole: "LW", metrics: ["CAM", "LW", "R", "GER"] },
  { name: "Pedri", shortName: "Pedri", country: "Spain", team: "Barcelona", role: "CM", secondaryRole: "CAM", metrics: ["CM", "CAM", "R", "ESP"] },
  { name: "Bukayo Saka", shortName: "B. Saka", country: "England", team: "Arsenal", role: "RW", secondaryRole: "RM", metrics: ["RW", "RM", "L", "ENG"] },
  { name: "Ousmane Dembélé", shortName: "O. Dembélé", country: "France", team: "Paris Saint-Germain", role: "RW", secondaryRole: "ST", metrics: ["RW", "ST", "B", "FRA"] },
  { name: "Declan Rice", shortName: "D. Rice", country: "England", team: "Arsenal", role: "CDM", secondaryRole: "CM", metrics: ["CDM", "CM", "R", "ENG"] },
  { name: "William Saliba", shortName: "W. Saliba", country: "France", team: "Arsenal", role: "CB", secondaryRole: "RCB", metrics: ["CB", "RCB", "R", "FRA"] },
  { name: "Virgil van Dijk", shortName: "V. van Dijk", country: "Netherlands", team: "Liverpool", role: "CB", secondaryRole: "LCB", metrics: ["CB", "LCB", "R", "NED"] },
  { name: "Achraf Hakimi", shortName: "A. Hakimi", country: "Morocco", team: "Paris Saint-Germain", role: "RB", secondaryRole: "RWB", metrics: ["RB", "RWB", "R", "MAR"] },
  { name: "Alphonso Davies", shortName: "A. Davies", country: "Canada", team: "Bayern Munich", role: "LB", secondaryRole: "LWB", metrics: ["LB", "LWB", "L", "CAN"] },
  { name: "Gianluigi Donnarumma", shortName: "G. Donnarumma", country: "Italy", team: "Paris Saint-Germain", role: "GK", metrics: ["GK", "GK", "R", "ITA"] },
  { name: "Alisson Becker", shortName: "Alisson", country: "Brazil", team: "Liverpool", role: "GK", metrics: ["GK", "GK", "R", "BRA"] },
  { name: "Federico Valverde", shortName: "F. Valverde", country: "Uruguay", team: "Real Madrid", role: "CM", secondaryRole: "RM", metrics: ["CM", "RM", "R", "URU"] },
];

function buildCatalog(seeds: Seed[], sport: Athlete["sport"]): Athlete[] {
  return seeds.map((player, index) => {
    const id = `${sport}-${index + 1}`;
    const syncedStats = generatedStats as Record<string, Athlete["realStats"]>;
    return {
      ...player,
      id,
      sport,
      basePrice: sport === "cricket" ? 50 + (index % 5) * 25 : 10 + (index % 6) * 5,
      gameRating: 84 + ((seeds.length - index) % 11),
      accent: sport === "cricket" ? "#f4b941" : "#56e0c4",
      source: { provider: "Curated profile", kind: "identity" },
      identity: player.metrics.map((value, metricIndex) => ({
        label: ["PRIMARY", "SECONDARY", sport === "football" ? "FOOT" : "STYLE", "COUNTRY"][metricIndex],
        value,
      })),
      realStats: syncedStats[id] ?? [],
    };
  });
}

export const athleteCatalog: Athlete[] = [
  ...buildCatalog(cricket, "cricket"),
  ...buildCatalog(football, "football"),
];
