import { ChevronDownIcon } from "./icons.js";

import type { LibraryPartRow } from "./library-source-parts.js";
import type { SourceSummary } from "@mdbase-reader/core";
import type { JSX } from "react";

export function LibraryPartDisclosure({
  source,
  row,
  onToggle,
}: {
  readonly source: SourceSummary;
  readonly row: LibraryPartRow | undefined;
  readonly onToggle: (() => void) | undefined;
}): JSX.Element | null {
  return row?.expandable ? (
    <button
      type="button"
      className="icon-button library-part-disclosure"
      aria-label={`${row.expanded ? "Collapse" : "Expand"} parts of ${source.title}`}
      aria-expanded={row.expanded}
      onClick={(event) => {
        event.stopPropagation();
        onToggle?.();
      }}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <ChevronDownIcon />
    </button>
  ) : row ? (
    <span className="library-part-spacer" aria-hidden="true" />
  ) : null;
}
