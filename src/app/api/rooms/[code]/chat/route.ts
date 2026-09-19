import { z } from "zod";
import { apiHandler, json, parseBody, requestSession } from "@/lib/api";
import { getRoomChat, sendRoomChatMessage } from "@/lib/auction/room-service";

const attachmentSchema = z.object({
  name: z.string().min(1).max(120),
  mimeType: z.string().min(1).max(160),
  size: z.number().int().positive().max(2_000_000),
  base64: z.string().min(1).max(3_500_000),
});

const messageSchema = z.object({
  text: z.string().max(2_000).default(""),
  attachments: z.array(attachmentSchema).max(3).default([]),
});

type Context = { params: Promise<{ code: string }> };
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: Context) {
  return apiHandler(async () => {
    const { code } = await params;
    const session = requestSession(request);
    return json({ messages: await getRoomChat(code, session.playerId, session.token) });
  });
}

export async function POST(request: Request, { params }: Context) {
  return apiHandler(async () => {
    const { code } = await params;
    const session = requestSession(request);
    const body = await parseBody(request, messageSchema);
    return json({ message: await sendRoomChatMessage(code, session.playerId, session.token, body.text, body.attachments) });
  });
}
