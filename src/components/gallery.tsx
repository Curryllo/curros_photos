"use client";

import { Camera } from "lucide-react";
import { useEffect, useState } from "react";
import Aurora from "@/components/bits/Aurora";
import ClickSpark from "@/components/bits/ClickSpark";
import FadeContent from "@/components/bits/FadeContent";
import Noise from "@/components/bits/Noise";
import ShinyText from "@/components/bits/ShinyText";
import SpotlightCard from "@/components/bits/SpotlightCard";
import SplitText from "@/components/bits/SplitText";
import Lightbox from "@/components/lightbox";
import type { CachedPhoto, GalleryResponse } from "@/lib/types";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: GalleryResponse };

function PhotoFallback({ photo }: { photo: CachedPhoto }) {
  return (
    <a
      href={photo.permalink ?? "#"}
      target="_blank"
      rel="noopener noreferrer"
      className="flex aspect-square w-full items-center justify-center rounded-lg border border-white/10 bg-neutral-900 p-6 text-center text-sm text-neutral-500 transition-colors hover:text-neutral-300"
    >
      <span className="inline-flex flex-col items-center gap-2">
        <Camera className="h-5 w-5" />
        View on Instagram
      </span>
    </a>
  );
}

export default function Gallery() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/gallery")
      .then(async (res) => {
        if (!res.ok) throw new Error(`Gallery request failed (${res.status})`);
        return (await res.json()) as GalleryResponse;
      })
      .then((data) => setState({ status: "ready", data }))
      .catch((err: Error) =>
        setState({ status: "error", message: err.message }),
      );
  }, []);

  const username =
    state.status === "ready" ? state.data.profile?.username : null;
  const photos = state.status === "ready" ? state.data.photos : [];

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-neutral-950 text-neutral-100">
      <Noise fixed opacity={0.055} size={1.2} dust={0.15} zIndex={60} />
      <ClickSpark
        layer="front"
        sparkColor="rgba(255,255,255,0.7)"
        sparkCount={7}
        sparkSize={10}
        duration={0.45}
      >
        <header className="relative flex min-h-[72vh] flex-col items-center justify-center overflow-hidden px-4">
          <Aurora
            className="pointer-events-none absolute inset-x-0 top-0 h-[60vh]"
            colorStops={["#1a1a2e", "#2d2144", "#162032"]}
            amplitude={0.9}
            blend={0.7}
            speed={0.6}
            opacity={0.55}
            direction="top"
          />
          <div className="relative z-10 text-center">
            <SplitText
              text="Curros Photos"
              tag="h1"
              className="text-5xl font-light tracking-tight text-white sm:text-7xl"
              splitType="chars"
              effect="rise"
              trigger="load"
              duration={0.9}
              delay={15}
              staggerFrom="center"
              hoverEffect="lift"
              mask
            />
            <div className="mt-5">
              {username ? (
                <ShinyText
                  text={`@${username} · photography`}
                  shineColor="rgba(255,255,255,0.55)"
                  speed={4}
                  trigger="loop"
                  className="text-sm tracking-wide text-neutral-400"
                />
              ) : (
                <p className="text-sm tracking-wide text-neutral-500">
                  photography
                </p>
              )}
            </div>
          </div>
        </header>

        <main className="relative z-10 mx-auto max-w-7xl px-4 pb-24 sm:px-6">
          {state.status === "loading" && (
            <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 [&>*]:mb-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="w-full animate-pulse rounded-lg bg-neutral-900"
                  style={{ aspectRatio: i % 2 ? "3/4" : "4/3" }}
                />
              ))}
            </div>
          )}

          {state.status === "error" && (
            <p className="py-16 text-center text-sm text-neutral-500">
              Could not load the gallery: {state.message}
            </p>
          )}

          {state.status === "ready" && photos.length === 0 && (
            <p className="py-16 text-center text-sm text-neutral-500">
              No photos synced yet. Run{" "}
              <code className="rounded bg-neutral-900 px-1.5 py-0.5 text-neutral-300">
                curl -H &quot;x-cron-secret: $CRON_SECRET&quot;
                localhost:3000/api/cron/sync
              </code>{" "}
              or wait for the daily sync.
            </p>
          )}

          {photos.length > 0 && (
            <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 [&>*]:mb-4">
              {photos.map((photo, i) => (
                <FadeContent
                  key={photo.id}
                  effect="dissolve"
                  blur={4}
                  duration={1.1}
                  threshold={0.15}
                  trigger="scroll"
                  once
                  className="break-inside-avoid"
                >
                  <button
                    type="button"
                    onClick={() => setLightboxIndex(i)}
                    className="block w-full cursor-zoom-in text-left"
                    aria-label={photo.caption?.slice(0, 120) ?? "Open photo"}
                  >
                    <SpotlightCard
                      theme="dark"
                      spotlightColor="rgba(255,255,255,0.12)"
                      intensity={0.6}
                      className="overflow-hidden"
                      style={{ padding: 0, borderRadius: "0.5rem" }}
                    >
                      {photo.mediaUrl ? (
                        // Signed Instagram URLs expire, so plain img avoids optimizer caching.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={photo.mediaUrl}
                          alt={photo.caption?.slice(0, 120) ?? ""}
                          loading="lazy"
                          decoding="async"
                          className="w-full transition-transform duration-500 ease-out group-hover:scale-[1.02]"
                        />
                      ) : (
                        <PhotoFallback photo={photo} />
                      )}
                      {photo.mediaType === "VIDEO" && (
                        <span className="absolute left-3 top-3 z-10 rounded-full bg-black/60 px-2.5 py-0.5 text-[11px] text-white">
                          Video
                        </span>
                      )}
                      {photo.mediaType === "CAROUSEL_ALBUM" && (
                        <span className="absolute right-3 top-3 z-10 rounded-full bg-black/60 px-2.5 py-0.5 text-[11px] text-white">
                          {photo.children.length || ""} Album
                        </span>
                      )}
                    </SpotlightCard>
                  </button>
                </FadeContent>
              ))}
            </div>
          )}
        </main>

        <footer className="relative z-10 border-t border-white/5 py-8 text-center text-xs text-neutral-600">
          {username && <>@{username} · </>}
          synced from Instagram
          {state.status === "ready" && state.data.lastSyncAt && (
            <>
              {" · last sync "}
              {new Date(state.data.lastSyncAt).toLocaleDateString("en-GB")}
            </>
          )}
        </footer>

        {lightboxIndex !== null && (
          <Lightbox
            photos={photos}
            index={lightboxIndex}
            onClose={() => setLightboxIndex(null)}
            onNavigate={setLightboxIndex}
          />
        )}
      </ClickSpark>
    </div>
  );
}
