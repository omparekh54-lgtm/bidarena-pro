import { z } from "zod";
import { apiHandler, json, parseBody, requestSession } from "@/lib/api";
import { configureGame } from "@/lib/auction/room-service";

type Context = { params: Promise<{ code: string }> };
const ConfigureBody = z.object({ sport: z.enum(["cricket", "football"]) });

export async function POST(request: Request, { params }: Context) {
  return apiHandler(async () => {
    const [{ code }, input] = await Promise.all([params, parseBody(request, ConfigureBody)]);
    const session = requestSession(request);
    const room = await configureGame(code, session.playerId, session.token, input.sport);
    return json({ room });
  });
}

