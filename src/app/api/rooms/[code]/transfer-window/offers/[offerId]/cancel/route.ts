import { apiHandler, json, requestSession } from "@/lib/api";
import { cancelTransferOffer } from "@/lib/auction/room-service";

type Context = { params: Promise<{ code: string; offerId: string }> };

export async function POST(request: Request, { params }: Context) {
  return apiHandler(async () => {
    const { code, offerId } = await params;
    const session = requestSession(request);
    return json({ room: await cancelTransferOffer(code, session.playerId, session.token, offerId) });
  });
}
