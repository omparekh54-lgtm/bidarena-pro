import { z } from "zod";
import { apiHandler, json, parseBody, requestSession } from "@/lib/api";
import { startTournamentRound } from "@/lib/auction/room-service";

type Context = { params: Promise<{ code: string }> };
const schema = z.object({ expectedRound: z.number().int().positive().optional() });

export async function POST(request: Request, { params }: Context) {
  return apiHandler(async () => {
    const { code } = await params;
    const session = requestSession(request);
    const body = await parseBody(request, schema);
    return json({ room: await startTournamentRound(code, session.playerId, session.token, body.expectedRound) });
  });
}
