import { apiHandler, json, requestSession } from "@/lib/api";
import { resumeGame } from "@/lib/auction/room-service";

type Context = { params: Promise<{ code: string }> };

export async function POST(request: Request, { params }: Context) {
  return apiHandler(async () => {
    const { code } = await params;
    const session = requestSession(request);
    return json({ room: await resumeGame(code, session.playerId, session.token) });
  });
}
