import { useCallback, useEffect, useRef, useState } from "react";

import { problemMessage } from "./capture-model.js";
import { SourceNoteSession } from "./source-note-session.js";

import type { ReaderConnectedCollection } from "@mdbase-reader/connect";
import type { Source, SourceSummary } from "@mdbase-reader/core";

export interface SourceNoteController {
  readonly status: "idle" | "loading" | "ready" | "failed";
  readonly session: SourceNoteSession | null;
  readonly problem: string | null;
  /** Reads the saved source once, when its note is first shown. */
  readonly load: () => void;
}

type Loaded =
  | { readonly sourceId: string; readonly status: "loading" }
  | { readonly sourceId: string; readonly status: "ready"; readonly session: SourceNoteSession }
  | { readonly sourceId: string; readonly status: "failed"; readonly problem: string };

/**
 * The saved source's title, tags and literature note, editable in the panel. One note
 * session per source for the panel's lifetime, so returning to a page resumes its text.
 */
export function useSourceNote(
  collection: () => ReaderConnectedCollection | null,
  source: SourceSummary | null,
  onSaved: (source: Source) => void,
): SourceNoteController {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const sessions = useRef(new Map<string, SourceNoteSession>());
  const sourceId = source?.id ?? null;
  const current = loaded?.sourceId === sourceId ? loaded : null;
  const session = current?.status === "ready" ? current.session : null;
  // A session kept for an earlier page goes on saving; only the shown source is published.
  const shown = useRef({ sourceId, onSaved });
  useEffect(() => {
    shown.current = { sourceId, onSaved };
  }, [sourceId, onSaved]);

  const load = useCallback(() => {
    const connected = collection();
    if (!sourceId || !connected) {
      return;
    }
    const kept = sessions.current.get(sourceId);
    if (kept) {
      setLoaded({ sourceId, status: "ready", session: kept });
      return;
    }
    setLoaded({ sourceId, status: "loading" });
    void connected.sources.get(connected.collectionId, sourceId).then(
      (full) => {
        if (!full) {
          throw new Error("This source is no longer in the collection.");
        }
        const created = new SourceNoteSession(full, connected, undefined, (saved) => {
          if (shown.current.sourceId === saved.id) {
            shown.current.onSaved(saved);
          }
        });
        sessions.current.set(sourceId, created);
        void created.start();
        setLoaded({ sourceId, status: "ready", session: created });
      },
      (reason: unknown) =>
        setLoaded({ sourceId, status: "failed", problem: problemMessage(reason) }),
    );
  }, [collection, sourceId]);

  useEffect(() => {
    if (!session) {
      return;
    }
    // Returning to the panel may follow edits made in Reader meanwhile.
    const onVisible = (): void => {
      if (document.visibilityState === "visible") {
        session.refresh();
      } else {
        session.keepCopy();
      }
    };
    const onFocus = (): void => session.refresh();
    const onHide = (): void => session.keepCopy();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pagehide", onHide);
    };
  }, [session]);

  return {
    status: current?.status ?? "idle",
    session,
    problem: current?.status === "failed" ? current.problem : null,
    load,
  };
}
