import { describe, expect, it } from "vitest";
import {
  InstagramApiError,
  exchangeForLongLivedToken,
  fetchAllMedia,
  getProfile,
  refreshLongLivedToken,
} from "@/lib/instagram";
import type { FetchLike } from "@/lib/instagram";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockFetch(routes: Record<string, unknown>): {
  fetchImpl: FetchLike;
  calls: string[];
} {
  const calls: string[] = [];
  const fetchImpl: FetchLike = async (input) => {
    const url = String(input);
    calls.push(url);
    for (const [prefix, body] of Object.entries(routes)) {
      if (url.startsWith(prefix)) return jsonResponse(body);
    }
    return jsonResponse({ error: { message: `no mock for ${url}` } }, 404);
  };
  return { fetchImpl, calls };
}

describe("getProfile", () => {
  it("returns ig user id and username", async () => {
    const { fetchImpl } = mockFetch({
      "https://graph.instagram.com/v26.0/me": {
        user_id: "123",
        username: "curros",
      },
    });
    await expect(getProfile("tok", fetchImpl)).resolves.toEqual({
      igUserId: "123",
      username: "curros",
    });
  });
});

describe("fetchAllMedia", () => {
  it("follows paging.next across pages", async () => {
    const nextUrl =
      "https://graph.instagram.com/v26.0/123/media?after=cursor&access_token=tok";
    const { fetchImpl, calls } = mockFetch({
      "https://graph.instagram.com/v26.0/123/media?after=cursor": {
        data: [{ id: "b", media_type: "IMAGE", media_url: "https://cdn/b.jpg" }],
        paging: {},
      },
      "https://graph.instagram.com/v26.0/123/media": {
        data: [{ id: "a", media_type: "IMAGE", media_url: "https://cdn/a.jpg" }],
        paging: { next: nextUrl },
      },
    });

    const items = await fetchAllMedia("123", "tok", fetchImpl);
    expect(items.map((i) => i.id)).toEqual(["a", "b"]);
    expect(calls[1]).toBe(nextUrl);
  });

  it("throws InstagramApiError with the API message on failure", async () => {
    const failing: FetchLike = async () =>
      jsonResponse({ error: { message: "Invalid OAuth access token" } }, 400);

    await expect(fetchAllMedia("123", "tok", failing)).rejects.toMatchObject({
      name: "InstagramApiError",
      status: 400,
      message: "Invalid OAuth access token",
    });
    expect(InstagramApiError).toBeDefined();
  });
});

describe("token endpoints", () => {
  it("refreshes a long-lived token", async () => {
    const { fetchImpl, calls } = mockFetch({
      "https://graph.instagram.com/refresh_access_token": {
        access_token: "new-token",
        expires_in: 5_184_000,
      },
    });
    const result = await refreshLongLivedToken("old-token", fetchImpl);
    expect(result).toEqual({ accessToken: "new-token", expiresIn: 5_184_000 });
    expect(calls[0]).toContain("grant_type=ig_refresh_token");
  });

  it("exchanges a short-lived token", async () => {
    const { fetchImpl, calls } = mockFetch({
      "https://graph.instagram.com/access_token": {
        access_token: "long-token",
        expires_in: 5_184_000,
      },
    });
    const result = await exchangeForLongLivedToken("short", "secret", fetchImpl);
    expect(result.accessToken).toBe("long-token");
    expect(calls[0]).toContain("grant_type=ig_exchange_token");
    expect(calls[0]).toContain("client_secret=secret");
  });
});
