import { z } from "zod";
import { apiHandler, json, parseBody } from "@/lib/api";
import { joinGame } from "@/lib/auction/room-service";

type Context = { params: Promise<{ code: string }> };

const JoinRoomBody = z.object({
  teamName: z.string().trim().min(2, "Enter a team name with at least 2 characters.").max(32, "Keep the team name under 32 characters."),
});

export async function POST(request: Request, { params }: Context) {
  return apiHandler(async () => {
    const [{ code }, input] = await Promise.all([params, parseBody(request, JoinRoomBody)]);
    const game = await joinGame(code, input.teamName);
    return json(game, { status: 201 });
  });
}

