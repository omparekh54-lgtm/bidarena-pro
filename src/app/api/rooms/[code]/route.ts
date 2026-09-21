import { apiHandler, json, requestSession } from "@/lib/api";
import { getGame } from "@/lib/auction/room-service";
import { startTournamentRound } from "@/lib/auction/tournament-round-service";

type Context = { params: Promise<{ code: string }> };

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: Context) {
  return apiHandler(async () => {
    const { code } = await params;
    const session = requestSession(request);
    const room = await getGame(code, session.playerId, session.token);

    // Once the synchronized 5-second countdown expires, any connected player
    // can safely advance the round. This prevents the tournament from hanging
    // if the host closes the app during the countdown.
    const countdownExpired = room.tournament.roundPhase === "countdown"
      && Boolean(room.tournament.roundCountdownEndsAt)
      && Date.parse(room.tournament.roundCountdownEndsAt!) <= Date.now();

    if (countdownExpired) {
      const advanced = await startTournamentRound(code, session.playerId, session.token, room.tournament.currentRound);
      return json({ room: advanced });
    }

    return json({ room });
  });
}

