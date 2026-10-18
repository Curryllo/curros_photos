export interface CachedPhoto {
  id: string;
  mediaType: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  /** Signed Instagram CDN URL. Null when Instagram omits it (e.g. copyright flags). */
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  caption: string | null;
  permalink: string | null;
  /** ISO timestamp of the Instagram post. */
  timestamp: string | null;
  likeCount: number | null;
  commentsCount: number | null;
  children: {
    id: string;
    mediaType: string;
    mediaUrl: string | null;
    thumbnailUrl: string | null;
  }[];
  /** When mediaUrl was last fetched/refreshed from the API. ISO timestamp. */
  urlFetchedAt: string | null;
}

export interface GalleryResponse {
  profile: { username: string } | null;
  photos: CachedPhoto[];
  lastSyncAt: string | null;
  tokenExpiresAt: string | null;
}
