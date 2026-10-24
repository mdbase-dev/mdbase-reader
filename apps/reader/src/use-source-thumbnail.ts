import { useEffect, useRef, useState, type RefObject } from "react";

import {
  loadSourceThumbnail,
  sourceThumbnailPlan,
  thumbnailKey,
  type LoadedThumbnail,
  type SourceThumbnail,
  type ThumbnailFileReader,
  type ThumbnailLoader,
} from "./source-thumbnail.js";

import type { SourceSummary } from "@mdbase-reader/core";

/**
 * A source's thumbnail, loaded only once its element is on screen and the browser is idle.
 * Null until then, and when the source has none or it cannot be read; callers show the
 * typographic placeholder meanwhile. Unmounting cancels a download or render in progress.
 */
export function useSourceThumbnail(
  source: SourceSummary,
  readFile: ThumbnailFileReader | undefined,
  ref: RefObject<HTMLElement | null>,
  load: ThumbnailLoader = loadSourceThumbnail,
): SourceThumbnail | null {
  const plan = sourceThumbnailPlan(source);
  const key = plan ? thumbnailKey(plan) : null;
  // The effect reads the plan for the current key without depending on the source object,
  // which a library refresh replaces even when the file is unchanged.
  const planRef = useRef(plan);
  const [loaded, setLoaded] = useState<{
    readonly key: string;
    readonly thumbnail: SourceThumbnail | null;
  } | null>(null);
  const loadedKey = useRef<string | null>(null);
  useEffect(() => {
    planRef.current = plan;
    loadedKey.current = loaded?.key ?? null;
  });

  useEffect(() => {
    const wanted = planRef.current;
    if (!key || !wanted || !readFile || loadedKey.current === key) {
      return undefined;
    }
    const controller = new AbortController();
    let cancelIdle: (() => void) | undefined;
    const start = (): void => {
      cancelIdle = whenIdle(() => {
        load(wanted, readFile, controller.signal).then(
          (thumbnail) => {
            if (!controller.signal.aborted) {
              setLoaded({ key, thumbnail: thumbnail && shown(thumbnail) });
            }
          },
          // Cancelled, or the file could not be read: the placeholder stays, and a later
          // mount tries again.
          () => undefined,
        );
      });
    };
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      start();
      return () => {
        controller.abort();
        cancelIdle?.();
      };
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        start();
      }
    });
    observer.observe(element);
    return () => {
      controller.abort();
      observer.disconnect();
      cancelIdle?.();
    };
  }, [key, readFile, ref, load]);

  // This mount made the URL, so it alone releases it: when a newer image replaces it, and on
  // unmount. Another card showing the same file holds a URL of its own.
  const url = loaded?.thumbnail?.url;
  useEffect(() => (url ? () => URL.revokeObjectURL(url) : undefined), [url]);
  return loaded?.key === key ? loaded.thumbnail : null;
}

function shown({ image, pageCount }: LoadedThumbnail): SourceThumbnail {
  return {
    url: URL.createObjectURL(image),
    ...(pageCount === undefined ? {} : { pageCount }),
  };
}

function whenIdle(run: () => void): () => void {
  if (typeof requestIdleCallback === "function") {
    const handle = requestIdleCallback(run, { timeout: 2_000 });
    return () => cancelIdleCallback(handle);
  }
  const handle = setTimeout(run, 200);
  return () => clearTimeout(handle);
}
