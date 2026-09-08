import { z } from "zod";
import { apiHandler, json, parseBody, requestSession } from "@/lib/api";
import { respondToTransferOffer } from "@/lib/auction/room-service";

type Context = { params: Promise<{ code: string; offerId: string }> };
const schema = z.object({ decision: z.enum(["accept", "decline"]) });

export async function POST(request: Request, { params }: Context) {
  return apiHandler(async () => {
    const { code, offerId } = await params;
    const session = requestSession(request);
    const { decision } = await parseBody(request, schema);
    return json({ room: await respondToTransferOffer(code, session.playerId, session.token, offerId, decision) });
  });
}
