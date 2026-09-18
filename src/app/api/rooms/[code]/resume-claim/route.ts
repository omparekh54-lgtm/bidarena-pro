import { z } from "zod";
import { apiHandler, json, parseBody } from "@/lib/api";
import { requestResumeTeamClaim } from "@/lib/auction/room-service";

const schema = z.object({ participantId: z.string().min(1) });
type Context = { params: Promise<{ code: string }> };

export async function POST(request: Request, { params }: Context) {
  return apiHandler(async () => {
    const { code } = await params;
    const body = await parseBody(request, schema);
    return json(await requestResumeTeamClaim(code, body.participantId));
  });
}
