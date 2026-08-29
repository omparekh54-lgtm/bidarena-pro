import { apiHandler, json, requestSession } from "@/lib/api";
import { getGame } from "@/lib/auction/room-service";

type Context = { params: Promise<{ code: string }> };

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: Context) {
  return apiHandler(async () => {
    const { code } = await params;
    const session = requestSession(request);
    const room = await getGame(code, session.playerId, session.token);
    return json({ room });
  });
}

