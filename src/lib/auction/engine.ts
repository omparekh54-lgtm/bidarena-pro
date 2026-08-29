import type { Athlete, RoomParticipant } from "./types";

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

export function canBid(participant: Pick<RoomParticipant, "budget" | "squad">, amount: number, minimumSlots = 2) {
  const reserve = Math.max(0, minimumSlots - participant.squad.length - 1) * 20;
  return participant.budget - amount >= reserve;
}

export function formatMoney(value: number, sport: Athlete["sport"] | null) {
  return sport === "cricket" ? `₹${(value / 100).toFixed(2)} Cr` : `€${value}m`;
}
