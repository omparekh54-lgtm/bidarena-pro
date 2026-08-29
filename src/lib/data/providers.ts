import { z } from "zod";

const ProviderError = z.object({ errors: z.unknown().optional() }).passthrough();

export type ProviderStatus = {
  provider: "API-Football" | "CricketData.org";
  configured: boolean;
  mode: "live" | "catalog";
};

export function providerStatus(): ProviderStatus[] {
  return [
    { provider: "API-Football", configured: Boolean(process.env.API_FOOTBALL_KEY), mode: process.env.API_FOOTBALL_KEY ? "live" : "catalog" },
    { provider: "CricketData.org", configured: Boolean(process.env.CRICKETDATA_API_KEY), mode: process.env.CRICKETDATA_API_KEY ? "live" : "catalog" },
  ];
}

export async function footballRequest<T>(path: string): Promise<T> {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) throw new Error("API_FOOTBALL_KEY is not configured");
  const response = await fetch(`https://v3.football.api-sports.io${path}`, {
    headers: { "x-apisports-key": key },
    next: { revalidate: 60 * 60 * 12 },
  });
  if (!response.ok) throw new Error(`API-Football request failed (${response.status})`);
  const payload: unknown = await response.json();
  const parsed = ProviderError.parse(payload);
  if (parsed.errors && Object.keys(parsed.errors as object).length) throw new Error("API-Football returned a provider error");
  return payload as T;
}

export async function cricketRequest<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const key = process.env.CRICKETDATA_API_KEY;
  if (!key) throw new Error("CRICKETDATA_API_KEY is not configured");
  const query = new URLSearchParams({ ...params, apikey: key });
  const response = await fetch(`https://api.cricapi.com/v1/${path}?${query}`, { next: { revalidate: 60 * 60 * 12 } });
  if (!response.ok) throw new Error(`CricketData request failed (${response.status})`);
  return response.json() as Promise<T>;
}
