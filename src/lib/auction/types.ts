export type Sport = "cricket" | "football";

export type AthleteSource = {
  provider: "API-Football" | "CricketData.org" | "Curated profile";
  kind: "identity" | "performance";
  sourceUrl?: string;
  verifiedAt?: string;
};

export type AthleteStat = {
  label: string;
  value: string;
  scope: string;
  source: AthleteSource;
};

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
  gameRating: number;
  accent: string;
  identity: Array<{ label: string; value: string }>;
  realStats: AthleteStat[];
  source: AthleteSource;
};

export type SquadEntry = {
  athleteId: string;
  amount: number;
  acquiredAt: string;
};

export type RoomParticipant = {
  id: string;
  teamName: string;
  code: string;
  color: string;
  budget: number;
  initialBudget: number;
  squad: SquadEntry[];
  joinedAt: string;
  tokenHash: string;
};

export type ParticipantView = Omit<RoomParticipant, "tokenHash" | "squad"> & {
  isAdmin: boolean;
  squad: Array<SquadEntry & { athlete: Athlete }>;
};

export type BidEvent = {
  id: string;
  athleteId: string;
  participantId: string;
  amount: number;
  at: string;
};

export type Sale = {
  athleteId: string;
  participantId: string;
  amount: number;
  soldAt: string;
};

export type AuctionPhase = "lobby" | "reveal" | "bidding" | "sold" | "unsold" | "complete";

export type AuctionRoom = {
  schemaVersion: 1;
  code: string;
  adminPlayerId: string;
  sport: Sport | null;
  purse: number | null;
  phase: AuctionPhase;
  queue: string[];
  lotIndex: number;
  currentBid: number;
  leaderId: string | null;
  deadlineAt: string | null;
  transitionAt: string | null;
  pausedAt: string | null;
  stoppedAt: string | null;
  participants: RoomParticipant[];
  bids: BidEvent[];
  sales: Sale[];
  unsoldAthleteIds: string[];
  createdAt: string;
  updatedAt: string;
  version: number;
};

export type RoomView = Omit<AuctionRoom, "participants" | "queue"> & {
  serverTime: string;
  isAdmin: boolean;
  selfPlayerId: string;
  currentAthlete: Athlete | null;
  queueLength: number;
  participants: ParticipantView[];
};

export type PlayerSession = {
  roomCode: string;
  playerId: string;
  token: string;
  teamName: string;
};
