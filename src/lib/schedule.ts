import "server-only";
import cron from "node-cron";
import { refreshTokenIfNeeded, syncMedia, refreshStaleUrls } from "./sync";

const BOOTSTRAPPED = Symbol.for("curros_photos.scheduler");

interface GlobalWithFlag {
  [BOOTSTRAPPED]?: boolean;
}

/** Import seed token / initial sync / cron jobs. Safe to call once per server process. */
export function startScheduler(): void {
  const g = globalThis as GlobalWithFlag;
  if (g[BOOTSTRAPPED]) return;
  g[BOOTSTRAPPED] = true;

  // Bootstrap: pull token from .env on first run; seed the gallery if empty.
  void bootstrap();

  // Daily full sync + URL renewal at 04:00.
  cron.schedule("0 4 * * *", () => {
    void runJob("daily sync", async () => {
      await syncMedia();
      await refreshStaleUrls();
    });
  });

  // Daily token check at 05:00 (no-op unless the token is 30+ days old).
  cron.schedule("0 5 * * *", () => {
    void runJob("token renewal check", () => refreshTokenIfNeeded(false));
  });
}

async function bootstrap(): Promise<void> {
  await runJob("bootstrap", async () => {
    const { readCache } = await import("./cache");
    const cache = await readCache();
    if (!cache.token) {
      const { ensureToken } = await import("./sync");
      await ensureToken();
    }
    if (cache.photos.length === 0) {
      await syncMedia();
    }
  });
}

async function runJob(name: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.error(`[scheduler] ${name} failed:`, err);
  }
}
