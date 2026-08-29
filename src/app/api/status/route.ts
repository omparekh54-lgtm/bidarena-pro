import { NextResponse } from "next/server";
import { athleteCatalog } from "@/data/catalog";
import { providerStatus } from "@/lib/data/providers";

export function GET() {
  return NextResponse.json({
    service: "bidarena-pro",
    status: "ok",
    catalog: {
      cricket: athleteCatalog.filter((athlete) => athlete.sport === "cricket").length,
      football: athleteCatalog.filter((athlete) => athlete.sport === "football").length,
    },
    providers: providerStatus(),
    generatedAt: new Date().toISOString(),
  }, { headers: { "Cache-Control": "no-store" } });
}
