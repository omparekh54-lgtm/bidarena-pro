import { apiHandler, json } from "@/lib/api";
import { getFinalResult } from "@/lib/auction/room-service";

type Context = { params: Promise<{ code: string }> };

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: Context) {
  return apiHandler(async () => {
    const { code } = await params;
    return json({ result: await getFinalResult(code) });
  });
}
