import { useEffect, useRef } from "react";

import type { ReaderLibrarySnapshot } from "./workspace-model.js";
import type { SourceId } from "@mdbase-reader/core";

/** Never resolve a source link against a different selected collection. */
export function requestedSourceId(url: string, collection: string): string | null {
  const params = new URL(url).searchParams;
  return params.get("collection") === collection ? params.get("source") : null;
}

export function SourceDeepLink({
  id,
  library,
  open,
}: {
  readonly id: string | null;
  readonly library: ReaderLibrarySnapshot;
  readonly open: (id: SourceId) => void;
}): React.JSX.Element | null {
  const opened = useRef<string | null>(null);
  const source = library.sources.find((item) => item.id === id);
  useEffect(() => {
    if (source && opened.current !== source.id) {
      opened.current = source.id;
      open(source.id);
    }
  }, [open, source]);
  if (id && !source && library.sourceIndex?.complete !== false) {
    return (
      <p role="alert">
        The linked source is not available in this collection. It may have been removed or your
        access may have changed.
      </p>
    );
  }
  return null;
}
