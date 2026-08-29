export type Sport = "cricket" | "football";

export type Athlete = {
  id: string;
  sport: Sport;
  name: string;
  shortName: string;
  country: string;
  team: string;
  role: string;
  secondaryRole?: string;
  basePrice: number;
  rating: number;
  accent: string;
  stats: Array<{ label: string; value: string }>;
  source: "API-Football" | "CricketData.org" | "Open data";
};

export type Franchise = {
  id: string;
  name: string;
  code: string;
  color: string;
  budget: number;
  initialBudget: number;
  squad: Athlete[];
};

export type BidEvent = {
  id: string;
  athleteId: string;
  franchiseId: string;
  amount: number;
  at: string;
};

export type Sale = {
  athlete: Athlete;
  franchiseId: string;
  amount: number;
};

export type AuctionPhase = "reveal" | "bidding" | "sold" | "unsold" | "complete";
