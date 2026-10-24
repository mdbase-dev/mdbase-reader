import { useEffect, useState, type RefObject } from "react";

import {
  loadSourceThumbnail,
  sourceThumbnailPlan,
  thumbnailKey,
  type SourceThumbnail,
  type SourceThumbnailPlan,
  type ThumbnailFileReader,
} from "./source-thumbnail.js";

import type { SourceSummary } from "@mdbase-reader/core";

type Loader = (
  plan: SourceThumbnailPlan,
  readFile: ThumbnailFileReader,
) => Promise<SourceThumbnail | null>;

/**
 * A source's thumbnail, loaded only once its element is on screen and the browser is idle.
 * Null until then, and when the source has none or it cannot be read; callers show the
 * typographic placeholder meanwhile.
 */
export function useSourceThumbnail(
  source: SourceSummary,
  readFile: ThumbnailFileReader | undefined,
  ref: RefObject<HTMLElement | null>,
  load: Loader = loadSourceThumbnail,
): SourceThumbnail | null {
  const plan = sourceThumbnailPlan(source);
  const key = plan ? thumbnailKey(plan) : null;
  const [loaded, setLoaded] = useState<{
    readonly key: string;
    readonly thumbnail: SourceThumbnail | null;
  } | null>(null);
  useEffect(() => {
    const wanted = sourceThumbnailPlan(source);
    if (!wanted || !readFile) {
      return undefined;
    }
    const wantedKey = thumbnailKey(wanted);
    let cancelled = false;
    let cancelIdle: (() => void) | undefined;
    const start = (): void => {
      cancelIdle = whenIdle(() => {
        void load(wanted, readFile).then((thumbnail) => {
          if (!cancelled) {
            setLoaded({ key: wantedKey, thumbnail });
          }
        });
      });
    };
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      start();
      return () => {
        cancelled = true;
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
      cancelled = true;
      observer.disconnect();
      cancelIdle?.();
    };
  }, [source, readFile, ref, load]);
  return loaded?.key === key ? loaded.thumbnail : null;
}

function whenIdle(run: () => void): () => void {
  if (typeof requestIdleCallback === "function") {
    const handle = requestIdleCallback(run, { timeout: 2_000 });
    return () => cancelIdleCallback(handle);
  }
  const handle = setTimeout(run, 200);
  return () => clearTimeout(handle);
}
