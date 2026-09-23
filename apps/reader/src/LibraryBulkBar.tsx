import { useState, type JSX } from "react";

import { CloseIcon } from "./icons.js";
import { countLabel, readingStatusChoices } from "./LibraryCells.js";

import type { ReadingStatus, SourceSummary } from "@mdbase-reader/core";

/** Opening many tabs at once is rarely what anyone means; beyond this, ask for a smaller set. */
export const bulkOpenLimit = 12;

export interface BulkStatusProgress {
  readonly done: number;
  readonly total: number;
  readonly failed: number;
}

/** Actions for several selected sources: reading status, opening, and exporting citations. */
export function LibraryBulkBar({
  selected,
  onClear,
  onSetStatus,
  onOpen,
  onExport,
}: {
  readonly selected: readonly SourceSummary[];
  readonly onClear: () => void;
  readonly onSetStatus?: (
    sources: readonly SourceSummary[],
    status: ReadingStatus,
    progress: (value: BulkStatusProgress) => void,
  ) => Promise<void>;
  readonly onOpen: (sources: readonly SourceSummary[]) => void;
  readonly onExport: (sources: readonly SourceSummary[]) => void;
}): JSX.Element {
  const [progress, setProgress] = useState<BulkStatusProgress | null>(null);
  const busy = progress !== null && progress.done < progress.total;
  return (
    <div className="library-bulk-bar" role="toolbar" aria-label="Selected sources">
      <strong aria-live="polite">{countLabel(selected.length, "source")} selected</strong>
      {onSetStatus ? (
        <label className="library-bulk-status">
          <span className="sr-only">Set reading status of the selected sources</span>
          <select
            value=""
            disabled={busy}
            onChange={(event) => {
              const status = event.target.value as ReadingStatus;
              setProgress({ done: 0, total: selected.length, failed: 0 });
              void onSetStatus(selected, status, setProgress);
            }}
          >
            <option value="" disabled>
              Set status…
            </option>
            {readingStatusChoices.map((status) => (
              <option key={status} value={status}>
                {status.charAt(0).toLocaleUpperCase() + status.slice(1)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <button
        type="button"
        disabled={selected.length > bulkOpenLimit}
        title={
          selected.length > bulkOpenLimit
            ? `Select ${String(bulkOpenLimit)} or fewer to open them together`
            : "Open each in its own tab"
        }
        onClick={() => onOpen(selected)}
      >
        Open
      </button>
      <button type="button" onClick={() => onExport(selected)}>
        Export citations
      </button>
      {progress ? (
        <span className="library-bulk-progress" role="status">
          {busy
            ? `Updating ${String(progress.done)} of ${String(progress.total)}…`
            : progress.failed > 0
              ? `${countLabel(progress.failed, "source")} could not be updated`
              : "Status updated"}
        </span>
      ) : null}
      <button
        type="button"
        className="icon-button library-bulk-clear"
        aria-label="Clear selection"
        title="Clear selection · Esc"
        onClick={onClear}
      >
        <CloseIcon />
      </button>
    </div>
  );
}
