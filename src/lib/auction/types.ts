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
  squadSize: number;
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

export type TournamentFormat = "league" | "league-knockout" | "knockout" | "groups-knockout";
export type TournamentStatus = "setup" | "active" | "complete";
export type MatchStatus = "scheduled" | "ready" | "complete";

export type FootballFormation = "4-3-3" | "4-4-2" | "4-2-3-1" | "3-5-2" | "3-4-3" | "5-3-2" | "4-1-4-1";
export type FootballLineup = {
  formation: FootballFormation;
  starterIds: string[];
  slotAssignments: Record<string, string>;
  substituteIds: string[];
};

export type CricketLineup = {
  playingXi: string[];
  battingOrder: string[];
  bowlingPlan: string[];
};

export type TossState = {
  calls: Record<string, "heads" | "tails">;
  coin?: "heads" | "tails";
  winnerParticipantId?: string;
  decision?: "bat" | "bowl";
};

export type TournamentResult = {
  homeScore: number;
  awayScore: number;
  summary: string;
  homeDetail?: string;
  awayDetail?: string;
  homeOvers?: number;
  awayOvers?: number;
  homeAllOut?: boolean;
  awayAllOut?: boolean;
};

export type TournamentFixture = {
  id: string;
  round: number;
  stage: "league" | "group" | "quarterfinal" | "semifinal" | "final" | "knockout";
  homeParticipantId: string;
  awayParticipantId: string;
  status: MatchStatus;
  footballLineups?: Record<string, FootballLineup>;
  cricketLineups?: Record<string, CricketLineup>;
  toss?: TossState;
  result?: TournamentResult;
};

export type StandingRow = {
  participantId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  points: number;
  scored: number;
  conceded: number;
  difference: number;
  oversFor: number;
  oversAgainst: number;
  nrr: number;
};

export type TournamentState = {
  status: TournamentStatus;
  format: TournamentFormat | null;
  cricketOvers: 10 | 20 | 50;
  currentRound: number;
  fixtures: TournamentFixture[];
  standings: StandingRow[];
  championParticipantId?: string;
  startedAt?: string;
  completedAt?: string;
};

export type ResumeClaim = {
  id: string;
  participantId: string;
  requestedAt: string;
  approvedAt?: string;
  tokenHash: string;
};

export type ResumeClaimView = Omit<ResumeClaim, "tokenHash">;

export type SessionResumeState = {
  endedAt: string | null;
  requestedAt: string | null;
  votes: string[];
  claims: ResumeClaim[];
};

export type SessionResumeView = Omit<SessionResumeState, "claims"> & {
  claims: ResumeClaimView[];
};

export type ResumeGameInfo = {
  code: string;
  sport: Sport | null;
  phase: AuctionPhase;
  tournamentRound: number;
  endedAt: string;
  participants: Array<{
    id: string;
    teamName: string;
    code: string;
    isAdmin: boolean;
  }>;
};

export type AuctionPhase = "lobby" | "reveal" | "bidding" | "sold" | "unsold" | "between-lots" | "tournament-setup" | "tournament" | "complete";

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
  tournament: TournamentState;
  sessionResume: SessionResumeState;
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

export type RoomView = Omit<AuctionRoom, "participants" | "queue" | "sessionResume"> & {
  sessionResume: SessionResumeView;
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
