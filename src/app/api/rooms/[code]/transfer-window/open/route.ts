import { z } from "zod";
import { apiHandler, json, parseBody, requestSession } from "@/lib/api";
import { openTransferWindow } from "@/lib/auction/room-service";

type Context = { params: Promise<{ code: string }> };
const schema = z.object({ durationSeconds: z.number().int().min(30).max(3_600) });

export async function POST(request: Request, { params }: Context) {
  return apiHandler(async () => {
    const { code } = await params;
    const session = requestSession(request);
    const { durationSeconds } = await parseBody(request, schema);
    return json({ room: await openTransferWindow(code, session.playerId, session.token, durationSeconds) });
  });
}
