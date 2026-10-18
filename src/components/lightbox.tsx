"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Heart, MessageCircle, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { CachedPhoto } from "@/lib/types";

interface LightboxProps {
  photos: CachedPhoto[];
  index: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

function slidesFor(photo: CachedPhoto): { src: string; isVideo: boolean }[] {
  if (photo.mediaType === "CAROUSEL_ALBUM" && photo.children.length > 0) {
    const children = photo.children
      .filter((c) => c.mediaUrl)
      .map((c) => ({ src: c.mediaUrl as string, isVideo: false }));
    if (children.length > 0) return children;
  }
  if (photo.mediaType === "VIDEO") {
    const src = photo.thumbnailUrl ?? photo.mediaUrl;
    return src ? [{ src, isVideo: true }] : [];
  }
  return photo.mediaUrl ? [{ src: photo.mediaUrl, isVideo: false }] : [];
}

function formatDate(timestamp: string | null): string | null {
  if (!timestamp) return null;
  // Instagram returns "+0000"; ECMAScript wants "+00:00".
  const iso = timestamp.replace(/\+0000$/, "+00:00");
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function Lightbox({
  photos,
  index,
  onClose,
  onNavigate,
}: LightboxProps) {
  const photo = photos[index];
  const slides = photo ? slidesFor(photo) : [];
  const [slide, setSlide] = useState(0);

  const prev = useCallback(() => {
    if (slide > 0) setSlide((s) => s - 1);
    else if (index > 0) {
      onNavigate(index - 1);
      setSlide(0);
    }
  }, [slide, index, onNavigate]);

  const next = useCallback(() => {
    if (slide < slides.length - 1) setSlide((s) => s + 1);
    else if (index < photos.length - 1) {
      onNavigate(index + 1);
      setSlide(0);
    }
  }, [slide, slides.length, index, photos.length, onNavigate]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    }
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose, prev, next]);

  if (!photo) return null;

  const currentSlide = slides[slide];
  const date = formatDate(photo.timestamp);

  return (
    <AnimatePresence>
      <motion.div
        key="lightbox"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-sm"
        onClick={onClose}
      >
        <div className="flex items-center justify-between px-4 py-3 text-neutral-400 sm:px-6">
          <span className="text-sm tabular-nums">
            {index + 1} / {photos.length}
            {slides.length > 1 && ` · ${slide + 1}/${slides.length}`}
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-2 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div
          className="relative flex min-h-0 flex-1 items-center justify-center px-2 sm:px-16"
          onClick={(e) => e.stopPropagation()}
        >
          {index > 0 && (
            <button
              onClick={prev}
              aria-label="Previous photo"
              className="absolute left-1 z-10 rounded-full bg-black/40 p-2 text-white/80 transition-colors hover:bg-black/70 hover:text-white sm:left-4"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}

          <div className="relative flex max-h-full w-full max-w-5xl items-center justify-center">
            {currentSlide ? (
              <motion.div
                key={currentSlide.src}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.2 }}
                className="relative"
              >
                {/* Signed Instagram URLs expire, so plain img avoids optimizer caching. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={currentSlide.src}
                  alt={photo.caption?.slice(0, 120) ?? "Photo"}
                  className="max-h-[80vh] w-auto max-w-full rounded-md object-contain shadow-2xl"
                />
                {currentSlide.isVideo && (
                  <span className="absolute bottom-3 left-3 rounded-full bg-black/70 px-3 py-1 text-xs text-white">
                    Video — open on Instagram to watch
                  </span>
                )}
                {slides.length > 1 && (
                  <span className="absolute right-3 top-3 rounded-full bg-black/70 px-2.5 py-1 text-xs text-white tabular-nums">
                    {slide + 1}/{slides.length}
                  </span>
                )}
              </motion.div>
            ) : (
              <a
                href={photo.permalink ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-white/10 px-6 py-8 text-neutral-300 transition-colors hover:text-white"
              >
                Photo unavailable here — view it on Instagram
              </a>
            )}
          </div>

          {index < photos.length - 1 && (
            <button
              onClick={next}
              aria-label="Next photo"
              className="absolute right-1 z-10 rounded-full bg-black/40 p-2 text-white/80 transition-colors hover:bg-black/70 hover:text-white sm:right-4"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          )}
        </div>

        <div
          className="mx-auto max-w-3xl px-6 pb-8 pt-4 text-neutral-300"
          onClick={(e) => e.stopPropagation()}
        >
          {photo.caption && (
            <p className="mb-3 line-clamp-4 whitespace-pre-wrap text-sm leading-relaxed">
              {photo.caption}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-neutral-500">
            {photo.likeCount !== null && (
              <span className="inline-flex items-center gap-1.5">
                <Heart className="h-3.5 w-3.5" />
                {photo.likeCount.toLocaleString()}
              </span>
            )}
            {photo.commentsCount !== null && (
              <span className="inline-flex items-center gap-1.5">
                <MessageCircle className="h-3.5 w-3.5" />
                {photo.commentsCount.toLocaleString()}
              </span>
            )}
            {date && <span>{date}</span>}
            {photo.permalink && (
              <a
                href={photo.permalink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-neutral-400 underline-offset-4 transition-colors hover:text-white hover:underline"
              >
                View on Instagram
              </a>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
