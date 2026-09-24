import { useState, type JSX } from "react";

import { propertyValue } from "./library-columns.js";
import { editableText } from "./library-field-edit.js";

import type { SourceSummary } from "@mdbase-reader/core";

/**
 * A field value being edited in place. Enter or leaving the cell saves, Escape cancels, and an
 * empty value removes the field. The input keeps the value's own form (e.g. `[[link|alias]]`).
 */
export function LibraryFieldCellEditor({
  source,
  fieldKey,
  onSave,
  onDone,
}: {
  readonly source: SourceSummary;
  readonly fieldKey: string;
  readonly onSave: (text: string) => Promise<void>;
  readonly onDone: () => void;
}): JSX.Element {
  const initial = editableText(propertyValue(source, fieldKey));
  const [text, setText] = useState(initial);
  const [saving, setSaving] = useState(false);
  const commit = (): void => {
    if (saving) {
      return;
    }
    if (text === initial) {
      onDone();
      return;
    }
    setSaving(true);
    void onSave(text)
      .then(onDone)
      // The library reports the failure; keep the text so nothing typed is lost.
      .catch(() => setSaving(false));
  };
  return (
    <input
      className="library-field-editor"
      aria-label={`Edit ${fieldKey}`}
      value={text}
      disabled={saving}
      // eslint-disable-next-line jsx-a11y/no-autofocus -- editing begins by asking for this input.
      autoFocus
      onFocus={(event) => event.currentTarget.select()}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        } else if (event.key === "Escape") {
          event.preventDefault();
          onDone();
        }
      }}
    />
  );
}
