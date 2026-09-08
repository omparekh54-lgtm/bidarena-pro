export type Sport = "cricket" | "football";
export type PlayerPoolMode = "current" | "legends" | "mixed";
export type AthleteEra = "current" | "legend";

export type AthleteSource = {
  provider: "API-Football" | "CricketData.org" | "Curated profile" | "Verified career record";
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
  era: AthleteEra;
  name: string;
  shortName: string;
  country: string;
  team: string;
  role: string;
  secondaryRole?: string;
  imageUrl?: string;
  providerId?: string;
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

export type TransferWindowStatus = "closed" | "open";
export type TransferOfferType = "swap" | "sell" | "buy";
export type TransferOfferStatus = "pending" | "accepted" | "declined" | "cancelled" | "expired";

export type TransferOffer = {
  id: string;
  type: TransferOfferType;
  fromParticipantId: string;
  toParticipantId: string;
  offeredAthleteIds: string[];
  requestedAthleteIds: string[];
  cashAdjustment: number;
  status: TransferOfferStatus;
  createdAt: string;
  respondedAt?: string;
};

export type TransferWindow = {
  status: TransferWindowStatus;
  startedAt: string | null;
  endsAt: string | null;
  durationSeconds: number | null;
  offers: TransferOffer[];
  /** True only when opening the window paused an otherwise-running auction. */
  resumeAuctionOnClose: boolean;
};

export type AuctionPhase = "lobby" | "reveal" | "bidding" | "sold" | "unsold" | "between-lots" | "complete";

export type AuctionRoom = {
  schemaVersion: 1;
  code: string;
  adminPlayerId: string;
  sport: Sport | null;
  playerPoolMode: PlayerPoolMode | null;
  purse: number | null;
  phase: AuctionPhase;
  cycleCount: number;
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
  transferWindow: TransferWindow;
  createdAt: string;
  updatedAt: string;
  version: number;
};

export type FinalParticipantResult = {
  participantId: string;
  teamName: string;
  finalBudget: number;
  squad: Array<SquadEntry & { athlete: Pick<Athlete, "id" | "name" | "shortName" | "role" | "country" | "team"> }>;
};

export type FinalRoomResult = {
  code: string;
  sport: Sport;
  playerPoolMode: PlayerPoolMode;
  purse: number;
  completedAt: string;
  participants: FinalParticipantResult[];
};

export type RoomView = Omit<AuctionRoom, "participants" | "queue"> & {
  serverTime: string;
  isAdmin: boolean;
  selfPlayerId: string;
  currentAthlete: Athlete | null;
  queueLength: number;
  poolComposition: Array<{ role: string; count: number }>;
  participants: ParticipantView[];
};

export type PlayerSession = {
  roomCode: string;
  playerId: string;
  token: string;
  teamName: string;
};
