import { z } from "zod";
import { apiHandler, json, parseBody } from "@/lib/api";
import { getResumeTeamClaimStatus } from "@/lib/auction/room-service";

const schema = z.object({ claimToken: z.string().min(20) });
type Context = { params: Promise<{ code: string; claimId: string }> };

export async function POST(request: Request, { params }: Context) {
  return apiHandler(async () => {
    const { code, claimId } = await params;
    const body = await parseBody(request, schema);
    return json(await getResumeTeamClaimStatus(code, claimId, body.claimToken));
  });
}
