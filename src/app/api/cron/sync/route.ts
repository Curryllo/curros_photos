import { isAuthorizedCronRequest, unauthorized } from "@/lib/cron-guard";
import { refreshStaleUrls, syncMedia } from "@/lib/sync";

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) return unauthorized();

  const sync = await syncMedia();
  const urls = await refreshStaleUrls();
  return Response.json({ ok: true, ...sync, urls });
}
