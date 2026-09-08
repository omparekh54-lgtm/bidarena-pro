import { z } from "zod";
import { apiHandler, json, parseBody, requestSession } from "@/lib/api";
import { createTransferOffer } from "@/lib/auction/room-service";

type Context = { params: Promise<{ code: string }> };
const schema = z.object({
  toParticipantId: z.string().min(1),
  type: z.enum(["swap", "sell", "buy"]),
  offeredAthleteIds: z.array(z.string().min(1)).max(20),
  requestedAthleteIds: z.array(z.string().min(1)).max(20),
  cashAdjustment: z.number().int(),
});

export async function POST(request: Request, { params }: Context) {
  return apiHandler(async () => {
    const { code } = await params;
    const session = requestSession(request);
    const input = await parseBody(request, schema);
    return json({ room: await createTransferOffer(code, session.playerId, session.token, input) });
  });
}
