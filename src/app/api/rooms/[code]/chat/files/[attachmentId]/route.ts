import { apiHandler, requestSession } from "@/lib/api";
import { getRoomChatAttachment } from "@/lib/auction/room-service";

type Context = { params: Promise<{ code: string; attachmentId: string }> };
export const dynamic = "force-dynamic";

function safeFilename(name: string) {
  return name.replace(/[\\/"\r\n]/g, "_").slice(0, 120) || "attachment";
}

export async function GET(request: Request, { params }: Context) {
  return apiHandler(async () => {
    const { code, attachmentId } = await params;
    const session = requestSession(request);
    const file = await getRoomChatAttachment(code, session.playerId, session.token, attachmentId);
    return new Response(file.bytes, {
      status: 200,
      headers: {
        "Content-Type": file.mimeType || "application/octet-stream",
        "Content-Length": String(file.bytes.byteLength),
        "Content-Disposition": `attachment; filename="${safeFilename(file.name)}"`,
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  });
}
