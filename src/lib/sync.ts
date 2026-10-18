import "server-only";
import {
  type CacheFile,
  type CachedPhoto,
  getCachePath,
  readCache,
  writeCache,
} from "./cache";
import { decrypt, encrypt } from "./crypto";
import { getEnv } from "./env";
import {
  type FetchLike,
  InstagramApiError,
  exchangeForLongLivedToken,
  fetchAllMedia,
  fetchMediaUrl,
  getProfile,
  refreshLongLivedToken,
} from "./instagram";

/** Renew the token at most this often (API allows refresh every 24h, tokens last 60d). */
export const TOKEN_REFRESH_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;
/** Refresh media URLs older than this — Instagram signed links expire after a few days. */
export const URL_MAX_AGE_MS = 48 * 60 * 60 * 1000;
const URL_REFRESH_DELAY_MS = 200;

export interface SyncDeps {
  fetchImpl?: FetchLike;
  cachePath?: string;
  now?: () => Date;
  log?: (msg: string) => void;
}

function defaultLog(msg: string): void {
  console.log(`[sync] ${msg}`);
}

function requireEncryptionPassphrase(): string {
  const key = getEnv().TOKEN_ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY is not set — required to store the token in data/cache.json",
    );
  }
  return key;
}

export async function ensureToken(deps: SyncDeps = {}): Promise<string> {
  const { cachePath = getCachePath() } = deps;
  const cache = await readCache(cachePath);

  if (cache.token) {
    return decrypt(cache.token.encrypted, requireEncryptionPassphrase());
  }

  const envToken = getEnv().IG_ACCESS_TOKEN;
  if (!envToken) {
    throw new Error(
      "No token available: data/cache.json has none and IG_ACCESS_TOKEN is not set in .env",
    );
  }

  // Prefer exchanging the seed for a long-lived token when an app secret is configured.
  // Falls back to importing the seed as-is (it may already be long-lived).
  const appSecret = getEnv().IG_APP_SECRET;
  let accessToken = envToken;
  let expiresAt: string | null = null;

  if (appSecret) {
    try {
      const exchanged = await exchangeForLongLivedToken(
        envToken,
        appSecret,
        deps.fetchImpl,
      );
      accessToken = exchanged.accessToken;
      expiresAt = new Date(Date.now() + exchanged.expiresIn * 1000).toISOString();
    } catch (err) {
      deps.log?.(
        `token exchange failed (${(err as Error).message}) — importing IG_ACCESS_TOKEN as-is`,
      );
    }
  }

  const now = deps.now?.() ?? new Date();
  cache.token = {
    encrypted: encrypt(accessToken, requireEncryptionPassphrase()),
    importedAt: now.toISOString(),
    lastRefreshedAt: now.toISOString(),
    expiresAt,
  };
  await writeCache(cache, cachePath);
  deps.log?.("imported seed token from IG_ACCESS_TOKEN into data/cache.json");
  return accessToken;
}

export async function refreshTokenIfNeeded(
  force = false,
  deps: SyncDeps = {},
): Promise<{ refreshed: boolean; reason?: string }> {
  const { cachePath = getCachePath(), now = () => new Date() } = deps;
  const cache = await readCache(cachePath);
  if (!cache.token) {
    await ensureToken(deps);
    return { refreshed: false, reason: "seed token imported" };
  }

  const last = new Date(cache.token.lastRefreshedAt).getTime();
  const age = now().getTime() - last;

  if (!force && age < TOKEN_REFRESH_INTERVAL_MS) {
    return { refreshed: false, reason: "token not due for renewal yet" };
  }
  // The API only refreshes tokens that are at least 24h old.
  if (age < 24 * 60 * 60 * 1000) {
    return { refreshed: false, reason: "token younger than 24h, cannot refresh yet" };
  }

  const token = decrypt(cache.token.encrypted, requireEncryptionPassphrase());
  const result = await refreshLongLivedToken(token, deps.fetchImpl);

  cache.token = {
    encrypted: encrypt(result.accessToken, requireEncryptionPassphrase()),
    importedAt: cache.token.importedAt,
    lastRefreshedAt: now().toISOString(),
    expiresAt: new Date(now().getTime() + result.expiresIn * 1000).toISOString(),
  };
  await writeCache(cache, cachePath);
  deps.log?.(
    `access token renewed, valid for ${Math.round(result.expiresIn / 86400)} days`,
  );
  return { refreshed: true };
}

function toCachedPhoto(
  item: {
    id: string;
    media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
    media_url?: string | null;
    thumbnail_url?: string | null;
    caption?: string | null;
    permalink?: string | null;
    timestamp?: string | null;
    like_count?: number | null;
    comments_count?: number | null;
    children?: {
      id: string;
      media_type: string;
      media_url?: string | null;
      thumbnail_url?: string | null;
    }[];
  },
  fetchedAt: string,
): CachedPhoto {
  return {
    id: item.id,
    mediaType: item.media_type,
    mediaUrl: item.media_url ?? null,
    thumbnailUrl: item.thumbnail_url ?? null,
    caption: item.caption ?? null,
    permalink: item.permalink ?? null,
    timestamp: item.timestamp ?? null,
    likeCount: item.like_count ?? null,
    commentsCount: item.comments_count ?? null,
    children: (item.children ?? []).map((c) => ({
      id: c.id,
      mediaType: c.media_type,
      mediaUrl: c.media_url ?? null,
      thumbnailUrl: c.thumbnail_url ?? null,
    })),
    urlFetchedAt: item.media_url ? fetchedAt : null,
  };
}

/** Full sync: profile + all media, replacing the cached photo list. */
export async function syncMedia(
  deps: SyncDeps = {},
): Promise<{ photoCount: number; username: string }> {
  const { cachePath = getCachePath(), now = () => new Date(), log = defaultLog } = deps;
  const token = await ensureToken(deps);
  const cache = await readCache(cachePath);

  const profile = await getProfile(token, deps.fetchImpl);
  const media = await fetchAllMedia(profile.igUserId, token, deps.fetchImpl);

  const fetchedAt = now().toISOString();
  const photos = media.map((item) => toCachedPhoto(item, fetchedAt));

  cache.profile = { igUserId: profile.igUserId, username: profile.username };
  cache.photos = photos;
  cache.lastSyncAt = fetchedAt;
  await writeCache(cache, cachePath);

  log(`synced ${photos.length} media items for @${profile.username}`);
  return { photoCount: photos.length, username: profile.username };
}

/**
 * Re-fetch signed media URLs that are older than URL_MAX_AGE_MS.
 * Instagram invalidates media_url after a few days, so hotlinked photos
 * need periodic renewal.
 */
export async function refreshStaleUrls(
  deps: SyncDeps = {},
): Promise<{ checked: number; refreshed: number; failed: number }> {
  const {
    cachePath = getCachePath(),
    fetchImpl = fetch,
    now = () => new Date(),
    log = defaultLog,
  } = deps;
  const cache = await readCache(cachePath);
  if (!cache.token || cache.photos.length === 0) {
    return { checked: 0, refreshed: 0, failed: 0 };
  }

  const token = decrypt(cache.token.encrypted, requireEncryptionPassphrase());
  const cutoff = now().getTime() - URL_MAX_AGE_MS;
  const stale = cache.photos.filter((p) => {
    if (!p.mediaUrl) return false;
    return !p.urlFetchedAt || new Date(p.urlFetchedAt).getTime() < cutoff;
  });

  let refreshed = 0;
  let failed = 0;
  for (const photo of stale) {
    try {
      const { mediaUrl, thumbnailUrl } = await fetchMediaUrl(
        photo.id,
        token,
        fetchImpl,
      );
      if (mediaUrl) {
        photo.mediaUrl = mediaUrl;
        photo.thumbnailUrl = thumbnailUrl ?? photo.thumbnailUrl;
        photo.urlFetchedAt = now().toISOString();
        refreshed++;
      }
      await new Promise((r) => setTimeout(r, URL_REFRESH_DELAY_MS));
    } catch (err) {
      failed++;
      const status = err instanceof InstagramApiError ? err.status : undefined;
      log(`failed to refresh URL for media ${photo.id} (status ${status ?? "?"})`);
    }
  }

  if (refreshed > 0 || failed > 0) {
    await writeCache(cache, cachePath);
  }
  log(`url refresh: ${refreshed} renewed, ${failed} failed, ${stale.length} stale`);
  return { checked: stale.length, refreshed, failed };
}

/** Convenience for tests and callers that want the whole cache shape. */
export type { CacheFile };
