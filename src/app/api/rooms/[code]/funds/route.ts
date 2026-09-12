import { z } from "zod";
import { apiHandler, json, parseBody, requestSession } from "@/lib/api";
import { addFundsToEveryTeam } from "@/lib/auction/fund-service";

type Context = { params: Promise<{ code: string }> };
const schema = z.object({ amount: z.number().int().positive().max(100_000) });

export async function POST(request: Request, { params }: Context) {
  return apiHandler(async () => {
    const { code } = await params;
    const session = requestSession(request);
    const { amount } = await parseBody(request, schema);
    return json({ room: await addFundsToEveryTeam(code, session.playerId, session.token, amount) });
  });
}
