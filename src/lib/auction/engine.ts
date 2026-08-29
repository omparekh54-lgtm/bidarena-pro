import type { Athlete, Franchise } from "./types";

export function secureShuffle<T>(items: readonly T[]): T[] {
  const result = [...items];
  const values = new Uint32Array(result.length);
  if (typeof globalThis.crypto !== "undefined") {
    globalThis.crypto.getRandomValues(values);
  } else {
    for (let i = 0; i < values.length; i += 1) values[i] = Math.floor(Math.random() * 2 ** 32);
  }
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = values[i] % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
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

export function canBid(franchise: Franchise, amount: number, minimumSlots = 2) {
  const reserve = Math.max(0, minimumSlots - franchise.squad.length - 1) * 20;
  return franchise.budget - amount >= reserve;
}

export function formatMoney(value: number, sport: Athlete["sport"]) {
  return sport === "cricket" ? `₹${(value / 100).toFixed(2)} Cr` : `€${value}m`;
}
