import { useCallback, useEffect, useRef, useState } from "react";

interface StoredLayout {
  /** The view file revision the draft was made against; a newer save discards it. */
  readonly revision: string | null;
  readonly layout: unknown;
}

/**
 * Keeps a view's hand-arranged layout (columns, widths, sort) across reloads on this device.
 * Saving the view writes it to the view's mdbase file; a built-in view keeps it here. `parse`
 * validates a stored layout, which may predate the current format.
 */
export function useLayoutDraft<Layout>(
  storageKey: string,
  revision: string | null,
  saved: Layout,
  parse: (stored: unknown) => Layout,
): readonly [Layout, (layout: Layout) => void] {
  const [layout, setLayout] = useState<Layout>(() => restore(storageKey, revision, saved, parse));
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (pending.current) {
        clearTimeout(pending.current);
      }
    },
    [],
  );
  const savedJson = JSON.stringify(saved);
  const update = useCallback(
    (next: Layout): void => {
      setLayout(next);
      if (pending.current) {
        clearTimeout(pending.current);
      }
      // Resizing reports continuously; storage only needs the settled value.
      pending.current = setTimeout(() => persist(storageKey, revision, savedJson, next), 250);
    },
    [revision, savedJson, storageKey],
  );
  return [layout, update];
}

function restore<Layout>(
  key: string,
  revision: string | null,
  saved: Layout,
  parse: (stored: unknown) => Layout,
): Layout {
  try {
    const raw = globalThis.localStorage.getItem(key);
    if (!raw) {
      return saved;
    }
    const stored = JSON.parse(raw) as Partial<StoredLayout>;
    if (stored.revision !== revision || typeof stored.layout !== "object") {
      globalThis.localStorage.removeItem(key);
      return saved;
    }
    return parse(stored.layout);
  } catch {
    return saved;
  }
}

function persist(key: string, revision: string | null, savedJson: string, layout: unknown): void {
  try {
    if (JSON.stringify(layout) === savedJson) {
      globalThis.localStorage.removeItem(key);
    } else {
      const stored: StoredLayout = { revision, layout };
      globalThis.localStorage.setItem(key, JSON.stringify(stored));
    }
  } catch {
    // Layout memory is a convenience; constrained webviews may refuse storage.
  }
}
