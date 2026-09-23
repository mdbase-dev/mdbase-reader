import { useCallback, useEffect, useRef, useState } from "react";

import { libraryViewConfiguration } from "./mdbase-library-views.js";

import type { LibraryViewConfiguration, MdbaseLibraryView } from "./mdbase-library-views.js";

/** The parts of a view the reader arranges by hand: remembered on this device until saved. */
export type LibraryLayout = Pick<
  LibraryViewConfiguration,
  "presentation" | "columns" | "columnWidths" | "sortField" | "sortDirection"
>;

const prefix = "mdbase-reader:library-layout:v1:";

interface StoredLayout {
  /** The view file revision the draft was made against; a newer save discards it. */
  readonly revision: string | null;
  readonly layout: LibraryLayout;
}

export function layoutOf(configuration: LibraryViewConfiguration): LibraryLayout {
  const { presentation, columns, columnWidths, sortField, sortDirection } = configuration;
  return { presentation, columns, columnWidths, sortField, sortDirection };
}

export function sameLayout(left: LibraryLayout, right: LibraryLayout): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Keeps column, width, sort and layout changes for a view across reloads on this device.
 * Saving the view writes them to its mdbase file; the built-in view keeps them here.
 */
export function useLibraryLayoutDraft(
  collectionKey: string,
  view: MdbaseLibraryView,
): readonly [LibraryLayout, (layout: LibraryLayout) => void] {
  const key = `${prefix}${collectionKey}:${view.key}`;
  const [layout, setLayout] = useState<LibraryLayout>(() => restore(key, view));
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (pending.current) {
        clearTimeout(pending.current);
      }
    },
    [],
  );
  const update = useCallback(
    (next: LibraryLayout): void => {
      setLayout(next);
      if (pending.current) {
        clearTimeout(pending.current);
      }
      // Resizing reports continuously; storage only needs the settled value.
      pending.current = setTimeout(() => persist(key, view, next), 250);
    },
    [key, view],
  );
  return [layout, update];
}

function restore(key: string, view: MdbaseLibraryView): LibraryLayout {
  const saved = layoutOf(view.configuration);
  try {
    const raw = globalThis.localStorage.getItem(key);
    if (!raw) {
      return saved;
    }
    const stored = JSON.parse(raw) as Partial<StoredLayout>;
    if (stored.revision !== view.revision || typeof stored.layout !== "object") {
      globalThis.localStorage.removeItem(key);
      return saved;
    }
    // Validate through the same parser the view file uses.
    const parsed = libraryViewConfiguration({
      type: stored.layout.presentation,
      options: { ...stored.layout, filter: view.configuration.filter },
    });
    return layoutOf(parsed);
  } catch {
    return saved;
  }
}

function persist(key: string, view: MdbaseLibraryView, layout: LibraryLayout): void {
  try {
    if (sameLayout(layout, layoutOf(view.configuration))) {
      globalThis.localStorage.removeItem(key);
    } else {
      const stored: StoredLayout = { revision: view.revision, layout };
      globalThis.localStorage.setItem(key, JSON.stringify(stored));
    }
  } catch {
    // Layout memory is a convenience; constrained webviews may refuse storage.
  }
}
