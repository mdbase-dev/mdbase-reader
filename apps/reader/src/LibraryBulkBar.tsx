import { plural } from "@lingui/core/macro";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { Select } from "@mdbase-dev/ui/select";
import { isEditableSourceField } from "@mdbase-reader/core";
import { useId, useState, type JSX, type KeyboardEvent } from "react";

import { CloseIcon } from "./icons.js";
import { isPropertyKey } from "./library-columns.js";
import { readingStatusOptions } from "./LibraryCells.js";

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
  const { t } = useLingui();
  const [progress, setProgress] = useState<BulkStatusProgress | null>(null);
  const busy = progress !== null && progress.done < progress.total;
  const [fieldForm, setFieldForm] = useState<boolean>(false);
  return (
    <div
      className="library-bulk-bar"
      role="toolbar"
      aria-label={t({ message: "Selected sources", context: "LibraryBulkBar interface" })}
    >
      <strong aria-live="polite">
        <Plural value={selected.length} one="# source selected" other="# sources selected" />
      </strong>
      {onSetStatus ? (
        <label className="library-bulk-status">
          <Select
            aria-label={t({ message: "Set reading status of the selected sources" })}
            value=""
            placeholder={t({ message: "Set status…", context: "LibraryBulkBar interface" })}
            disabled={busy}
            options={readingStatusOptions()}
            onChange={(status) => {
              setProgress({ done: 0, total: selected.length, failed: 0 });
              void onSetStatus(selected, status, setProgress);
            }}
          />
        </label>
      ) : null}
      <button
        type="button"
        disabled={selected.length > bulkOpenLimit}
        title={
          selected.length > bulkOpenLimit
            ? t`Select ${String(bulkOpenLimit)} or fewer to open them together`
            : t({ message: "Open each in its own tab" })
        }
        onClick={() => onOpen(selected)}
      >
        <Trans context="LibraryBulkBar interface">Open</Trans>
      </button>
      <button type="button" onClick={() => onExport(selected)}>
        <Trans>Export citations</Trans>
      </button>
      {onSetField && !fieldForm ? (
        <button type="button" disabled={busy} onClick={() => setFieldForm(true)}>
          <Trans>Set field…</Trans>
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
            ? t`Updating ${String(progress.done)} of ${String(progress.total)}…`
            : progress.failed > 0
              ? t({
                  message: plural(progress.failed, {
                    one: "# source could not be updated",
                    other: "# sources could not be updated",
                  }),
                })
              : t({ message: "Updated", context: "LibraryBulkBar interface" })}
        </span>
      ) : null}
      <button
        type="button"
        className="icon-button library-bulk-clear"
        aria-label={t({ message: "Clear selection", context: "LibraryBulkBar interface" })}
        title={t({ message: "Clear selection · Esc" })}
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
  const { t } = useLingui();
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
      aria-label={t({ message: "Set a field on the selected sources" })}
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) {
          onApply(key, value);
        }
      }}
    >
      <input
        className="mdbase-field"
        aria-label={t({ message: "Field", context: "LibraryBulkBar interface" })}
        list={fieldListId}
        value={key}
        placeholder={t({ message: "field", context: "LibraryBulkBar interface" })}
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
        className="mdbase-field"
        aria-label={t({ message: "Value (empty removes the field)" })}
        value={value}
        placeholder={t({ message: "value, or empty to remove" })}
        onKeyDown={cancelOnEscape}
        onChange={(event) => setValue(event.target.value)}
      />
      <button type="submit" disabled={!valid}>
        <Trans>Apply</Trans>
      </button>
      <button type="button" onClick={onCancel}>
        <Trans>Cancel</Trans>
      </button>
    </form>
  );
}
