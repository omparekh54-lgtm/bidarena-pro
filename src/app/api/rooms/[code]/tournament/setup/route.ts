import { z } from "zod";
import { apiHandler, json, parseBody, requestSession } from "@/lib/api";
import { configureTournament } from "@/lib/auction/room-service";
type Context = { params: Promise<{ code: string }> };
const Body = z.object({
  format: z.enum(["league","league-knockout","knockout","groups-knockout"]),
  cricketOvers: z.union([z.literal(10), z.literal(20), z.literal(50)]),
});
export async function POST(request: Request, { params }: Context) {
  return apiHandler(async () => {
    const { code } = await params;
    const session = requestSession(request);
    const input = await parseBody(request, Body);
    return json({ room: await configureTournament(code, session.playerId, session.token, input.format, input.cricketOvers) });
  });
}
