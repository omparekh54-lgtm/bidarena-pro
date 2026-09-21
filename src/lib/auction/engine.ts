import type { Athlete, PlayerPoolMode, RoomParticipant, Sport } from "./types";

export type AuctionTier = 1 | 2 | 3;

export function auctionTier(athlete: Pick<Athlete, "era" | "gameRating">): AuctionTier {
  if (athlete.era === "legend") {
    if (athlete.gameRating >= 95) return 1;
    if (athlete.gameRating >= 92) return 2;
    return 3;
  }
  if (athlete.gameRating >= 90) return 1;
  if (athlete.gameRating >= 87) return 2;
  return 3;
}

export function secureShuffle<T>(items: readonly T[]): T[] {
  const result = [...items];
  const values = new Uint32Array(result.length);
  globalThis.crypto.getRandomValues(values);
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = values[index] % (index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export function nextBidAmount(current: number, base: number) {
  const amount = Math.max(current, base);
  if (amount < 100) return amount + 10;
  if (amount < 300) return amount + 20;
  if (amount < 700) return amount + 25;
  return amount + 50;
}

export function minimumBasePriceForPool(sport: Sport, mode: PlayerPoolMode = "current") {
  if (sport === "cricket") return mode === "legends" ? 150 : 50;
  return mode === "legends" ? 30 : 10;
}

export function canBid(
  participant: Pick<RoomParticipant, "budget" | "squad">,
  amount: number,
  minimumSquadSize = 11,
  reservePerRemainingPlayer = 0,
) {
  const remainingSlotsAfterPurchase = Math.max(0, minimumSquadSize - participant.squad.length - 1);
  const reserve = remainingSlotsAfterPurchase * Math.max(0, reservePerRemainingPlayer);
  return participant.budget - amount >= reserve;
}

export function formatMoney(value: number, sport: Athlete["sport"] | null) {
  return sport === "cricket" ? `₹${(value / 100).toFixed(2)} Cr` : `€${value}m`;
}
