import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type CacheFile, EMPTY_CACHE, readCache, writeCache } from "@/lib/cache";
import { encrypt } from "@/lib/crypto";
import { resetEnvCache } from "@/lib/env";
import type { FetchLike } from "@/lib/instagram";
import { ensureToken, refreshTokenIfNeeded, syncMedia } from "@/lib/sync";

const KEY = "test-key-123";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function tempCachePath(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "curros-test-"));
  return path.join(dir, "cache.json");
}

describe("sync", () => {
  let cachePath: string;

  beforeEach(async () => {
    cachePath = await tempCachePath();
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", KEY);
    vi.stubEnv("IG_ACCESS_TOKEN", "seed-token");
    delete process.env.IG_APP_SECRET;
    resetEnvCache();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnvCache();
  });

  describe("ensureToken", () => {
    it("imports the env seed token into the encrypted cache", async () => {
      const token = await ensureToken({ cachePath });
      expect(token).toBe("seed-token");

      const cache = await readCache(cachePath);
      expect(cache.token).not.toBeNull();
      expect(cache.token!.encrypted).not.toContain("seed-token");
      expect(cache.token!.expiresAt).toBeNull();
    });

    it("prefers the cached token over the env seed on later runs", async () => {
      const cache: CacheFile = {
        ...EMPTY_CACHE,
        token: {
          encrypted: encrypt("renewed-token", KEY),
          importedAt: new Date().toISOString(),
          lastRefreshedAt: new Date().toISOString(),
          expiresAt: null,
        },
      };
      await writeCache(cache, cachePath);

      await expect(ensureToken({ cachePath })).resolves.toBe("renewed-token");
    });

    it("throws when neither cache nor env has a token", async () => {
      vi.stubEnv("IG_ACCESS_TOKEN", "");
      delete process.env.IG_ACCESS_TOKEN;
      resetEnvCache();
      await expect(ensureToken({ cachePath })).rejects.toThrow(
        "No token available",
      );
    });
  });

  describe("refreshTokenIfNeeded", () => {
    async function seedToken(lastRefreshedAt: Date): Promise<void> {
      await writeCache(
        {
          ...EMPTY_CACHE,
          token: {
            encrypted: encrypt("cached-token", KEY),
            importedAt: lastRefreshedAt.toISOString(),
            lastRefreshedAt: lastRefreshedAt.toISOString(),
            expiresAt: null,
          },
        },
        cachePath,
      );
    }

    it("skips renewal when the token is younger than 30 days", async () => {
      await seedToken(new Date(Date.now() - 5 * 24 * 60 * 60 * 1000));
      const result = await refreshTokenIfNeeded(false, { cachePath });
      expect(result.refreshed).toBe(false);
      expect(result.reason).toMatch(/not due/);
    });

    it("refreshes a 31-day-old token and stores the new value", async () => {
      await seedToken(new Date(Date.now() - 31 * 24 * 60 * 60 * 1000));
      const fetchImpl: FetchLike = async () =>
        jsonResponse({
          access_token: "renewed-token",
          expires_in: 5_184_000,
        });

      const result = await refreshTokenIfNeeded(false, { cachePath, fetchImpl });
      expect(result.refreshed).toBe(true);

      const cache = await readCache(cachePath);
      expect(cache.token!.expiresAt).not.toBeNull();
      const { decrypt } = await import("@/lib/crypto");
      expect(decrypt(cache.token!.encrypted, KEY)).toBe("renewed-token");
    });

    it("refuses to force-refresh a token younger than 24h", async () => {
      await seedToken(new Date(Date.now() - 60 * 60 * 1000));
      const result = await refreshTokenIfNeeded(true, { cachePath });
      expect(result.refreshed).toBe(false);
      expect(result.reason).toMatch(/younger than 24h/);
    });
  });

  describe("syncMedia", () => {
    it("stores profile and photos in the cache", async () => {
      const fetchImpl: FetchLike = async (input) => {
        const url = String(input);
        if (url.includes("/me?")) {
          return jsonResponse({ user_id: "42", username: "curros" });
        }
        if (url.includes("/42/media")) {
          return jsonResponse({
            data: [
              {
                id: "m1",
                media_type: "IMAGE",
                media_url: "https://cdn.example/1.jpg",
                caption: "hello",
                permalink: "https://instagram.com/p/1",
                timestamp: "2026-10-01T10:00:00+0000",
                like_count: 5,
                comments_count: 1,
              },
              {
                id: "m2",
                media_type: "CAROUSEL_ALBUM",
                media_url: null,
                children: [
                  {
                    id: "m2a",
                    media_type: "IMAGE",
                    media_url: "https://cdn.example/2a.jpg",
                  },
                ],
              },
            ],
            paging: {},
          });
        }
        return jsonResponse({ error: { message: "unexpected" } }, 404);
      };

      const result = await syncMedia({ cachePath, fetchImpl, log: () => {} });
      expect(result).toEqual({ photoCount: 2, username: "curros" });

      const cache = await readCache(cachePath);
      expect(cache.profile).toEqual({ igUserId: "42", username: "curros" });
      expect(cache.photos[0]).toMatchObject({
        id: "m1",
        mediaUrl: "https://cdn.example/1.jpg",
        likeCount: 5,
      });
      expect(cache.photos[0].urlFetchedAt).not.toBeNull();
      // Copyright-flagged / URL-less media keeps a null URL.
      expect(cache.photos[1].mediaUrl).toBeNull();
      expect(cache.photos[1].urlFetchedAt).toBeNull();
      expect(cache.photos[1].children).toHaveLength(1);
      expect(cache.lastSyncAt).not.toBeNull();
    });
  });
});
