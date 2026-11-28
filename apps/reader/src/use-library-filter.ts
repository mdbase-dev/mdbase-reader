import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

import { parseLibraryViewFilter, type LibraryViewFilter } from "./mdbase-library-views.js";

const filterPrefix = "#reader-filter=";

function readFilter(hash: string, fallback: LibraryViewFilter): LibraryViewFilter {
  if (!hash.startsWith(filterPrefix)) {
    return fallback;
  }
  try {
    return parseLibraryViewFilter(JSON.parse(decodeURIComponent(hash.slice(filterPrefix.length))));
  } catch {
    return fallback;
  }
}

/** The primary All sources tab can restore a filter from a link or reload. */
export function useLibraryFilter(
  defaults: LibraryViewFilter,
  syncUrl: boolean,
): readonly [LibraryViewFilter, Dispatch<SetStateAction<LibraryViewFilter>>] {
  const [filter, setFilter] = useState(() =>
    syncUrl ? readFilter(window.location.hash, defaults) : defaults,
  );
  useEffect(() => {
    if (!syncUrl) {
      return;
    }
    const restore = (): void => setFilter(readFilter(window.location.hash, defaults));
    window.addEventListener("popstate", restore);
    window.addEventListener("hashchange", restore);
    return () => {
      window.removeEventListener("popstate", restore);
      window.removeEventListener("hashchange", restore);
    };
  }, [defaults, syncUrl]);

  useEffect(() => {
    if (!syncUrl) {
      return;
    }
    const url = new URL(window.location.href);
    if (url.hash && !url.hash.startsWith(filterPrefix)) {
      return;
    }
    const serialized = JSON.stringify(filter);
    const hash =
      serialized === JSON.stringify(defaults)
        ? ""
        : `${filterPrefix}${encodeURIComponent(serialized)}`;
    if (url.hash !== hash) {
      // Search can include private note text. HTTP requests omit the fragment.
      url.hash = hash;
      window.history.replaceState(window.history.state, "", url);
    }
  }, [defaults, filter, syncUrl]);
  return [filter, setFilter];
}
