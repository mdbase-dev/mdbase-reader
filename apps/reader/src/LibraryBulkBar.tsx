import { plural, t as translate } from "@lingui/core/macro";
import { useLingui as useLocale } from "@lingui/react";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { Select } from "@mdbase-dev/ui/select";
import { isEditableSourceField, isRequiredSourceField } from "@mdbase-reader/core";
import { useState, type JSX } from "react";

import { CloseIcon } from "./icons.js";
import { columnLabel, isPropertyKey, propertyColumn } from "./library-columns.js";
import { countLabel, readingStatusOptions } from "./LibraryCells.js";
import { Menu } from "./Menu.js";

import type { ReadingStatus, SourceSummary } from "@mdbase-reader/core";

/** Opening many tabs at once is rarely what anyone means; beyond this, ask for a smaller set. */
export const bulkOpenLimit = 12;

export interface BulkStatusProgress {
  readonly done: number;
  readonly total: number;
  readonly failed: number;
  readonly changed?: number;
}

/** Actions for several selected sources: reading status, opening, and exporting citations. */
export function LibraryBulkBar({
  selected,
  onClear,
  onSetStatus,
  onSetField,
  propertyKeys = [],
  properties = [],
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
  readonly properties?: readonly { readonly key: string; readonly label?: string }[];
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
      {onSetField && fieldForm && !busy ? (
        <BulkFieldForm
          key={selected.map(({ id }) => id).join("\n")}
          count={selected.length}
          propertyKeys={propertyKeys}
          properties={properties}
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
            : bulkProgressMessage(progress)}
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

function bulkProgressMessage(progress: BulkStatusProgress): string {
  const changed = progress.changed ?? progress.done - progress.failed;
  const updated = plural(changed, { one: "# source updated", other: "# sources updated" });
  if (!progress.failed) {
    return updated;
  }
  const failed = plural(progress.failed, {
    one: "# source could not be updated",
    other: "# sources could not be updated",
  });
  return translate`${updated}; ${failed}`;
}

/** Sets a value, or clears a field only after an explicit second step. */
function BulkFieldForm({
  count,
  propertyKeys,
  properties,
  onApply,
  onCancel,
}: {
  readonly count: number;
  readonly propertyKeys: readonly string[];
  readonly properties: readonly { readonly key: string; readonly label?: string }[];
  readonly onApply: (key: string, value: string) => void;
  readonly onCancel: () => void;
}): JSX.Element {
  const { t } = useLingui();
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [custom, setCustom] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const valid = count > 0 && isPropertyKey(key) && isEditableSourceField(key);
  const label = columnLabel(propertyColumn(key), properties);
  const chooseField = (field: string): void => {
    setKey(field);
    setConfirmClear(false);
  };
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Escape cancels from any control in the form.
    <form
      className="library-bulk-field"
      aria-label={t({ message: "Set a field on the selected sources" })}
      onSubmit={(event) => {
        event.preventDefault();
        if (valid && value.trim() && !confirmClear) {
          onApply(key, value);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          if (confirmClear) {
            setConfirmClear(false);
          } else {
            onCancel();
          }
        }
      }}
    >
      <BulkFieldPicker
        label={key ? label : translate({ message: "Choose field…" })}
        propertyKeys={propertyKeys}
        properties={properties}
        onChoose={(field, isCustom) => {
          setCustom(isCustom);
          chooseField(field);
        }}
      />
      {custom ? (
        <input
          className="mdbase-field"
          aria-label={translate({ message: "Custom field key" })}
          value={key}
          placeholder={translate({ message: "e.g. csl.volume" })}
          spellCheck={false}
          // eslint-disable-next-line jsx-a11y/no-autofocus -- custom entry was explicitly requested.
          autoFocus
          onChange={(event) => chooseField(event.target.value.trim())}
        />
      ) : key ? (
        <code className="library-bulk-field-key">{key}</code>
      ) : null}
      {confirmClear ? (
        <>
          <span role="status">
            <Trans>Clear </Trans>
            {label} <Trans>from </Trans>
            {countLabel(count, "source")}?
          </span>
          <button
            type="button"
            // eslint-disable-next-line jsx-a11y/no-autofocus -- keep keyboard focus in the explicit confirmation step.
            autoFocus
            onClick={() => onApply(key, "")}
          >{translate`Clear ${label}`}</button>
          <button type="button" onClick={() => setConfirmClear(false)}>
            <Trans>Keep field</Trans>
          </button>
        </>
      ) : (
        <>
          <input
            className="mdbase-field"
            aria-label={translate({ message: "Value" })}
            value={value}
            placeholder={translate({ message: "New value" })}
            onChange={(event) => setValue(event.target.value)}
          />
          <button type="submit" disabled={!valid || !value.trim()}>
            <Trans>Apply</Trans>
          </button>
          <button
            type="button"
            disabled={!valid || isRequiredSourceField(key)}
            onClick={() => setConfirmClear(true)}
          >
            <Trans>Clear field…</Trans>
          </button>
        </>
      )}
      <button type="button" onClick={onCancel}>
        <Trans context="Reader action">Cancel</Trans>
      </button>
    </form>
  );
}

function BulkFieldPicker({
  label,
  propertyKeys,
  properties,
  onChoose,
}: {
  readonly label: string;
  readonly propertyKeys: readonly string[];
  readonly properties: readonly { readonly key: string; readonly label?: string }[];
  readonly onChoose: (key: string, custom: boolean) => void;
}): JSX.Element {
  useLocale();
  return (
    <Menu
      label={translate({ message: "Choose field" })}
      trigger={label}
      triggerClassName="library-bulk-field-trigger"
      align="start"
    >
      {[...new Set(propertyKeys)].filter(isEditableSourceField).map((property) => (
        <button
          key={property}
          type="button"
          className="library-property-choice"
          onClick={() => onChoose(property, false)}
        >
          <span>{columnLabel(propertyColumn(property), properties)}</span>
          <code>{property}</code>
        </button>
      ))}
      <button type="button" onClick={() => onChoose("", true)}>
        <Trans>Custom field…</Trans>
      </button>
    </Menu>
  );
}
