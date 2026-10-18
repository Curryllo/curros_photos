import "server-only";
import { timingSafeEqual } from "node:crypto";
import { getEnv } from "./env";

/** Returns true when x-cron-secret header matches CRON_SECRET. */
export function isAuthorizedCronRequest(request: Request): boolean {
  const expected = getEnv().CRON_SECRET;
  if (!expected) return false;
  const provided = request.headers.get("x-cron-secret") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function unauthorized(): Response {
  return Response.json({ error: "unauthorized" }, { status: 403 });
}
