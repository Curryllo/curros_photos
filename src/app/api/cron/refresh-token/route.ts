import { isAuthorizedCronRequest, unauthorized } from "@/lib/cron-guard";
import { readCache } from "@/lib/cache";
import { refreshTokenIfNeeded } from "@/lib/sync";

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) return unauthorized();

  const result = await refreshTokenIfNeeded(true);
  const cache = await readCache();
  return Response.json({
    ok: true,
    ...result,
    lastRefreshedAt: cache.token?.lastRefreshedAt ?? null,
    expiresAt: cache.token?.expiresAt ?? null,
  });
}
