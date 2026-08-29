import { NextResponse } from "next/server";
import { providerStatus } from "@/lib/data/providers";
import { playerCatalogSummary } from "@/lib/auction/room-service";
import { durableRoomStoreConfigured, roomStoreMode } from "@/lib/auction/room-store";

export function GET() {
  return NextResponse.json({
    service: "bidarena-pro",
    status: "ok",
    catalog: playerCatalogSummary(),
    providers: providerStatus(),
    multiplayer: {
      durable: durableRoomStoreConfigured(),
      store: roomStoreMode(),
      maxTeams: 10,
      bidWindowSeconds: 10,
    },
    generatedAt: new Date().toISOString(),
  }, { headers: { "Cache-Control": "no-store" } });
}
