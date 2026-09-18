import { z } from "zod";
import { apiHandler, json, parseBody, requestSession } from "@/lib/api";
import { callTournamentToss, chooseTournamentTossDecision } from "@/lib/auction/room-service";
type Context = { params: Promise<{ code: string }> };
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("call"), fixtureId: z.string(), call: z.enum(["heads","tails"]) }),
  z.object({ action: z.literal("decision"), fixtureId: z.string(), decision: z.enum(["bat","bowl"]) }),
]);
export async function POST(request: Request, { params }: Context) {
  return apiHandler(async () => {
    const { code } = await params;
    const session = requestSession(request);
    const input = await parseBody(request, Body);
    const room = input.action === "call"
      ? await callTournamentToss(code, session.playerId, session.token, input.fixtureId, input.call)
      : await chooseTournamentTossDecision(code, session.playerId, session.token, input.fixtureId, input.decision);
    return json({ room });
  });
}
