import "server-only";

const IG_API_BASE = "https://graph.instagram.com/v26.0";

const MEDIA_FIELDS = [
  "id",
  "caption",
  "media_type",
  "media_url",
  "thumbnail_url",
  "permalink",
  "timestamp",
  "username",
  "like_count",
  "comments_count",
  "children{media_type,media_url,thumbnail_url}",
].join(",");

export type FetchLike = typeof fetch;

export interface IgProfile {
  igUserId: string;
  username: string;
}

export interface IgMediaItem {
  id: string;
  caption: string | null;
  media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  media_url: string | null;
  thumbnail_url: string | null;
  permalink: string | null;
  timestamp: string | null;
  like_count: number | null;
  comments_count: number | null;
  children?: {
    id: string;
    media_type: string;
    media_url: string | null;
    thumbnail_url: string | null;
  }[];
}

interface IgPaging {
  cursors?: { before?: string; after?: string };
  next?: string;
}

interface IgListResponse<T> {
  data: T[];
  paging?: IgPaging;
}

export class InstagramApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "InstagramApiError";
  }
}

async function igFetch<T>(
  url: string,
  fetchImpl: FetchLike = fetch,
): Promise<T> {
  const res = await fetchImpl(url, { cache: "no-store" });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const errMessage =
      (body as { error?: { message?: string } } | null)?.error?.message ??
      `Instagram API request failed with status ${res.status}`;
    throw new InstagramApiError(errMessage, res.status, body);
  }
  return body as T;
}

function buildUrl(
  pathname: string,
  params: Record<string, string>,
): string {
  const search = new URLSearchParams(params);
  return `${IG_API_BASE}${pathname}?${search.toString()}`;
}

export async function getProfile(
  token: string,
  fetchImpl: FetchLike = fetch,
): Promise<IgProfile> {
  const url = buildUrl("/me", { fields: "user_id,username", access_token: token });
  const body = await igFetch<{ user_id: string; username: string }>(url, fetchImpl);
  return { igUserId: body.user_id, username: body.username };
}

export async function fetchAllMedia(
  igUserId: string,
  token: string,
  fetchImpl: FetchLike = fetch,
): Promise<IgMediaItem[]> {
  const items: IgMediaItem[] = [];
  let url: string | null = buildUrl(`/${igUserId}/media`, {
    fields: MEDIA_FIELDS,
    limit: "100",
    access_token: token,
  });

  while (url) {
    const page: IgListResponse<IgMediaItem> = await igFetch<IgListResponse<IgMediaItem>>(
      url,
      fetchImpl,
    );
    items.push(...page.data);
    url = page.paging?.next ?? null;
  }

  return items;
}

export async function fetchMediaUrl(
  mediaId: string,
  token: string,
  fetchImpl: FetchLike = fetch,
): Promise<{ mediaUrl: string | null; thumbnailUrl: string | null }> {
  const url = buildUrl(`/${mediaId}`, {
    fields: "media_url,thumbnail_url",
    access_token: token,
  });
  const body = await igFetch<{ media_url?: string; thumbnail_url?: string }>(
    url,
    fetchImpl,
  );
  return { mediaUrl: body.media_url ?? null, thumbnailUrl: body.thumbnail_url ?? null };
}

export async function refreshLongLivedToken(
  token: string,
  fetchImpl: FetchLike = fetch,
): Promise<{ accessToken: string; expiresIn: number }> {
  const url = `https://graph.instagram.com/refresh_access_token?${new URLSearchParams({
    grant_type: "ig_refresh_token",
    access_token: token,
  }).toString()}`;
  const body = await igFetch<{ access_token: string; expires_in: number }>(
    url,
    fetchImpl,
  );
  return { accessToken: body.access_token, expiresIn: body.expires_in };
}

export async function exchangeForLongLivedToken(
  shortLivedToken: string,
  appSecret: string,
  fetchImpl: FetchLike = fetch,
): Promise<{ accessToken: string; expiresIn: number }> {
  const url = `https://graph.instagram.com/access_token?${new URLSearchParams({
    grant_type: "ig_exchange_token",
    client_secret: appSecret,
    access_token: shortLivedToken,
  }).toString()}`;
  const body = await igFetch<{ access_token: string; expires_in: number }>(
    url,
    fetchImpl,
  );
  return { accessToken: body.access_token, expiresIn: body.expires_in };
}
