import { isEditableSourceField } from "@mdbase-reader/core";
import { useId, useState, type JSX, type KeyboardEvent } from "react";

import { CloseIcon } from "./icons.js";
import { isPropertyKey } from "./library-columns.js";
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
  onSetField,
  propertyKeys = [],
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
  readonly onSetField?: (
    sources: readonly SourceSummary[],
    key: string,
    text: string,
    progress: (value: BulkStatusProgress) => void,
  ) => Promise<void>;
  readonly propertyKeys?: readonly string[];
  readonly onOpen: (sources: readonly SourceSummary[]) => void;
  readonly onExport: (sources: readonly SourceSummary[]) => void;
}): JSX.Element {
  const [progress, setProgress] = useState<BulkStatusProgress | null>(null);
  const busy = progress !== null && progress.done < progress.total;
  const [fieldForm, setFieldForm] = useState<boolean>(false);
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
      {onSetField && !fieldForm ? (
        <button type="button" disabled={busy} onClick={() => setFieldForm(true)}>
          Set field…
        </button>
      ) : null}
      {onSetField && fieldForm ? (
        <BulkFieldForm
          propertyKeys={propertyKeys}
          onCancel={() => setFieldForm(false)}
          onApply={(key, value) => {
            setProgress({ done: 0, total: selected.length, failed: 0 });
            void onSetField(selected, key, value, setProgress);
            setFieldForm(false);
          }}
        />
      ) : null}
      {progress ? (
        <span className="library-bulk-progress" role="status">
          {busy
            ? `Updating ${String(progress.done)} of ${String(progress.total)}…`
            : progress.failed > 0
              ? `${countLabel(progress.failed, "source")} could not be updated`
              : "Updated"}
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

/** One field and value to set on every selected source; an empty value removes the field. */
function BulkFieldForm({
  propertyKeys,
  onApply,
  onCancel,
}: {
  readonly propertyKeys: readonly string[];
  readonly onApply: (key: string, value: string) => void;
  readonly onCancel: () => void;
}): JSX.Element {
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const fieldListId = useId();
  const valid = isPropertyKey(key) && isEditableSourceField(key);
  const cancelOnEscape = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onCancel();
    }
  };
  return (
    <form
      className="library-bulk-field"
      aria-label="Set a field on the selected sources"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) {
          onApply(key, value);
        }
      }}
    >
      <input
        aria-label="Field"
        list={fieldListId}
        value={key}
        placeholder="field"
        spellCheck={false}
        // eslint-disable-next-line jsx-a11y/no-autofocus -- the form exists only to take this entry.
        autoFocus
        onKeyDown={cancelOnEscape}
        onChange={(event) => setKey(event.target.value.trim())}
      />
      <datalist id={fieldListId}>
        {propertyKeys.map((property) => (
          <option key={property} value={property} />
        ))}
      </datalist>
      <input
        aria-label="Value (empty removes the field)"
        value={value}
        placeholder="value, or empty to remove"
        onKeyDown={cancelOnEscape}
        onChange={(event) => setValue(event.target.value)}
      />
      <button type="submit" disabled={!valid}>
        Apply
      </button>
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
    </form>
  );
}
