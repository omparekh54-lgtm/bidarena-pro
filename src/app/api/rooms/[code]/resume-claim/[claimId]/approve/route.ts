import { apiHandler, json, requestSession } from "@/lib/api";
import { approveResumeTeamClaim } from "@/lib/auction/room-service";

type Context = { params: Promise<{ code: string; claimId: string }> };

export async function POST(request: Request, { params }: Context) {
  return apiHandler(async () => {
    const { code, claimId } = await params;
    const session = requestSession(request);
    return json({ room: await approveResumeTeamClaim(code, session.playerId, session.token, claimId) });
  });
}
