import { ZodError, type ZodType } from "zod";
import { AuctionError } from "@/lib/auction/errors";

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

export function json(data: unknown, init: ResponseInit = {}) {
  return Response.json(data, { ...init, headers: { ...NO_STORE_HEADERS, ...init.headers } });
}

export async function parseBody<T>(request: Request, schema: ZodType<T>) {
  return schema.parse(await request.json());
}

export function requestSession(request: Request) {
  return {
    playerId: request.headers.get("x-bidarena-player") ?? "",
    token: request.headers.get("x-bidarena-token") ?? "",
  };
}

export async function apiHandler(operation: () => Promise<Response>) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AuctionError) {
      return json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof ZodError) {
      return json({ error: error.issues[0]?.message ?? "Invalid request.", code: "INVALID_REQUEST" }, { status: 422 });
    }
    if (error instanceof SyntaxError) {
      return json({ error: "The request body must be valid JSON.", code: "INVALID_JSON" }, { status: 400 });
    }
    console.error("[bidarena-api] unhandled error", error);
    return json({ error: "An unexpected server error occurred.", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}

