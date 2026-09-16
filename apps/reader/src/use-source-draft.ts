import { useEffect, useMemo, useSyncExternalStore } from "react";

import { SourceDraftSession } from "./source-draft-session.js";

import type { SourceDraftSnapshot } from "./source-draft-session.js";
import type { DraftStorage } from "./source-draft-storage.js";
import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type { Source } from "@mdbase-reader/core";

const sessions = new WeakMap<ReaderWorkspaceGateway, Map<string, SourceDraftSession>>();
const empty: SourceDraftSnapshot = {
  body: "",
  status: "saved",
  error: null,
  locallySaved: false,
  localProblem: null,
  recovered: false,
  conflict: null,
};
const noSubscribe = (): (() => void) => () => undefined;
const emptySnapshot = (): SourceDraftSnapshot => empty;
const storage: DraftStorage = {
  getItem: (key) => globalThis.localStorage.getItem(key),
  setItem: (key, value) => globalThis.localStorage.setItem(key, value),
  removeItem: (key) => globalThis.localStorage.removeItem(key),
};

export function useSourceDraft(
  gateway: ReaderWorkspaceGateway,
  source: Source | null,
  publish: (source: Source) => void,
): {
  readonly session: SourceDraftSession | null;
  readonly snapshot: SourceDraftSnapshot;
} {
  const session = useMemo(() => {
    if (!source) {
      return null;
    }
    let cache = sessions.get(gateway);
    if (!cache) {
      cache = new Map();
      sessions.set(gateway, cache);
    }
    const key = `${source.collectionId}:${source.id}`;
    let value = cache.get(key);
    if (!value) {
      value = new SourceDraftSession(
        source,
        storage,
        (base, body) => gateway.saveSourceBody(base, body),
        () =>
          gateway.refreshSource ? gateway.refreshSource(source.id) : gateway.source(source.id),
        publish,
      );
      cache.set(key, value);
    }
    return value;
  }, [gateway, source, publish]);
  const snapshot = useSyncExternalStore(
    session?.subscribe ?? noSubscribe,
    session?.getSnapshot ?? emptySnapshot,
  );
  useEffect(() => {
    if (source) {
      session?.receive(source);
    }
  }, [session, source]);
  useEffect(() => {
    if (snapshot.savedSource) {
      publish(snapshot.savedSource);
    }
  }, [snapshot.savedSource, publish]);
  return { session, snapshot };
}
