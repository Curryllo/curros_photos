import { isAuthorizedCronRequest, unauthorized } from "@/lib/cron-guard";
import { readCache } from "@/lib/cache";
import { refreshStaleUrls } from "@/lib/sync";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const wantsRefresh = url.searchParams.get("refresh") === "1";

  if (wantsRefresh) {
    if (!isAuthorizedCronRequest(request)) return unauthorized();
    await refreshStaleUrls();
  }

  const cache = await readCache();
  return Response.json({
    profile: cache.profile
      ? { username: cache.profile.username }
      : null,
    photos: cache.photos,
    lastSyncAt: cache.lastSyncAt,
    tokenExpiresAt: cache.token?.expiresAt ?? null,
  });
}
