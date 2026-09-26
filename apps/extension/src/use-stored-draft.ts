import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

import { emptyDraft, loadDraft, preferredColor, saveDraft } from "./drafts.js";

import type { PageCapture } from "./page-capture.js";
import type { CaptureDraft } from "./save-capture.js";
import type { QuoteSelector } from "@mdbase-reader/core";

export interface StoredDraftState {
  readonly draft: CaptureDraft;
  readonly setDraft: Dispatch<SetStateAction<CaptureDraft>>;
  /** True when unsaved text from an earlier panel was brought back. */
  readonly restored: boolean;
}

/** Restores and persists the draft for this tab and page (see drafts.ts). */
export function useStoredDraft(
  tabId: number,
  capture: PageCapture | null,
  setSelection: (selection: QuoteSelector | null) => void,
): StoredDraftState {
  const [draft, setDraft] = useState<CaptureDraft>(emptyDraft);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const page = capture?.canonicalUrl ?? null;
  const selection = capture?.kind === "html" ? capture.selection : null;

  // A new passage is what the reader wants to highlight; a cleared one is done.
  const [seenSelection, setSeenSelection] = useState(selection);
  if (selection !== seenSelection) {
    setSeenSelection(selection);
    setDraft((current) => ({ ...current, highlight: Boolean(selection) }));
  }

  useEffect(() => {
    if (!capture || !page || loadedFor === page) {
      return;
    }
    let cancelled = false;
    // Text typed while the first page loads is kept; another page starts a fresh draft.
    const followed = loadedFor !== null;
    void Promise.all([loadDraft(tabId, page), preferredColor()]).then(([stored, color]) => {
      if (cancelled) {
        return;
      }
      if (stored) {
        setDraft({ ...stored.draft, title: stored.draft.title || capture.pageTitle });
        if (!selection && stored.selection) {
          setSelection(stored.selection);
        }
        setRestored(Boolean(stored.draft.note.trim() || stored.draft.comment.trim()));
      } else {
        setDraft((current) => ({
          ...(followed ? emptyDraft : current),
          title: (followed ? "" : current.title) || capture.pageTitle,
          highlight: Boolean(selection),
          color,
        }));
        setRestored(false);
      }
      setLoadedFor(page);
    });
    return () => {
      cancelled = true;
    };
  }, [capture, loadedFor, page, selection, setSelection, tabId]);

  useEffect(() => {
    if (!page || loadedFor !== page) {
      return;
    }
    const timer = setTimeout(() => void saveDraft(tabId, page, { draft, selection }), 250);
    return () => clearTimeout(timer);
  }, [draft, loadedFor, page, selection, tabId]);

  return { draft, setDraft, restored };
}
