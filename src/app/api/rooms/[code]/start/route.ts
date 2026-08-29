import { apiHandler, json, requestSession } from "@/lib/api";
import { startGame } from "@/lib/auction/room-service";

type Context = { params: Promise<{ code: string }> };

export async function POST(request: Request, { params }: Context) {
  return apiHandler(async () => {
    const { code } = await params;
    const session = requestSession(request);
    const room = await startGame(code, session.playerId, session.token);
    return json({ room });
  });
}

