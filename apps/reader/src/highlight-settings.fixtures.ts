import {
  readerSettingsDefinition,
  type AppSettingsSnapshot,
  type ReaderSettingsValues,
} from "@mdbase-reader/connect";
import { resolveAppSettings } from "@mdbase-reader/core";

import { bindHighlightSettings, type HighlightSettingsSource } from "./highlight-colors.js";

/**
 * A collection settings record for tests, bound as the open collection's: `set` replaces its
 * fields as an edit from another device would, `stop` goes back to no collection.
 */
export function bindCollectionHighlights(fields: Record<string, unknown> = {}): {
  readonly source: HighlightSettingsSource;
  readonly set: (fields: Record<string, unknown>) => void;
  readonly stop: () => void;
} {
  const listeners = new Set<() => void>();
  let snapshot = snapshotOf(fields);
  const source: HighlightSettingsSource = {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
  };
  const stop = bindHighlightSettings(source);
  return {
    source,
    set: (next) => {
      snapshot = snapshotOf(next);
      listeners.forEach((listener) => listener());
    },
    stop,
  };
}

function snapshotOf(fields: Record<string, unknown>): AppSettingsSnapshot<ReaderSettingsValues> {
  const frontmatter = {
    app: "dev.mdbase.reader",
    scope: "collection",
    settings_version: 1,
    ...fields,
  };
  return {
    status: "ready",
    settings: resolveAppSettings(readerSettingsDefinition, frontmatter),
    frontmatter,
    revision: "r1",
  };
}
