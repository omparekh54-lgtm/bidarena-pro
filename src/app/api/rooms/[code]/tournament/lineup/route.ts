import { z } from "zod";
import { apiHandler, json, parseBody, requestSession } from "@/lib/api";
import { submitCricketTournamentLineup, submitFootballTournamentLineup } from "@/lib/auction/room-service";
type Context = { params: Promise<{ code: string }> };
const Football = z.object({
  sport: z.literal("football"),
  fixtureId: z.string(),
  lineup: z.object({
    formation: z.enum(["4-3-3","4-4-2","4-2-3-1","3-5-2","3-4-3","5-3-2","4-1-4-1"]),
    starterIds: z.array(z.string()),
    slotAssignments: z.record(z.string(), z.string()),
    substituteIds: z.array(z.string()),
  }),
});
const Cricket = z.object({
  sport: z.literal("cricket"),
  fixtureId: z.string(),
  lineup: z.object({
    playingXi: z.array(z.string()),
    battingOrder: z.array(z.string()),
    bowlingPlan: z.array(z.string()),
  }),
});
const Body = z.discriminatedUnion("sport", [Football, Cricket]);
export async function POST(request: Request, { params }: Context) {
  return apiHandler(async () => {
    const { code } = await params;
    const session = requestSession(request);
    const input = await parseBody(request, Body);
    const room = input.sport === "football"
      ? await submitFootballTournamentLineup(code, session.playerId, session.token, input.fixtureId, input.lineup)
      : await submitCricketTournamentLineup(code, session.playerId, session.token, input.fixtureId, input.lineup);
    return json({ room });
  });
}
