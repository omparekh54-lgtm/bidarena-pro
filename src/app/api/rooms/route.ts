import { z } from "zod";
import { apiHandler, json, parseBody } from "@/lib/api";
import { createGame } from "@/lib/auction/room-service";

const CreateRoomBody = z.object({
  teamName: z.string().trim().min(2, "Enter a team name with at least 2 characters.").max(32, "Keep the team name under 32 characters."),
});

export async function POST(request: Request) {
  return apiHandler(async () => {
    const input = await parseBody(request, CreateRoomBody);
    const game = await createGame(input.teamName);
    return json(game, { status: 201 });
  });
}

