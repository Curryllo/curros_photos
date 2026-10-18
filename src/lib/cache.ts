import "server-only";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CachedPhoto } from "./types";

export type { CachedPhoto };

export interface CachedToken {
  /** AES-256-GCM encrypted access token. */
  encrypted: string;
  importedAt: string;
  lastRefreshedAt: string;
  /** ISO expiry, when the API reported one. */
  expiresAt: string | null;
}

export interface CacheFile {
  version: 1;
  token: CachedToken | null;
  profile: { igUserId: string; username: string } | null;
  photos: CachedPhoto[];
  lastSyncAt: string | null;
}

export const EMPTY_CACHE: CacheFile = {
  version: 1,
  token: null,
  profile: null,
  photos: [],
  lastSyncAt: null,
};

export function getCachePath(): string {
  return path.join(process.cwd(), "data", "cache.json");
}

export async function readCache(
  cachePath: string = getCachePath(),
): Promise<CacheFile> {
  try {
    const raw = await readFile(/* turbopackIgnore: true */ cachePath, "utf8");
    const parsed = JSON.parse(raw) as CacheFile;
    return { ...EMPTY_CACHE, ...parsed };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { ...EMPTY_CACHE };
    }
    throw err;
  }
}

export async function writeCache(
  cache: CacheFile,
  cachePath: string = getCachePath(),
): Promise<void> {
  await mkdir(/* turbopackIgnore: true */ path.dirname(cachePath), {
    recursive: true,
  });
  const tmpPath = `${cachePath}.tmp`;
  await writeFile(/* turbopackIgnore: true */ tmpPath, JSON.stringify(cache, null, 2), "utf8");
  await rename(/* turbopackIgnore: true */ tmpPath, cachePath);
}
