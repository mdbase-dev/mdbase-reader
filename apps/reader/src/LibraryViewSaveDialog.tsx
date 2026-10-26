import { Trans, useLingui } from "@lingui/react/macro";
import { useRef, useState, type JSX } from "react";

import { ModalDialog } from "./ModalDialog.js";

/** Names a new saved view. The caller saves it and closes the dialog. */
export function LibraryViewSaveDialog({
  description,
  placeholder,
  saving,
  onCancel,
  onSave,
}: {
  readonly description: string;
  readonly placeholder: string;
  readonly saving: boolean;
  readonly onCancel: () => void;
  readonly onSave: (name: string) => void;
}): JSX.Element {
  const { t } = useLingui();
  const [name, setName] = useState("");
  const input = useRef<HTMLInputElement>(null);
  return (
    <ModalDialog
      className="library-save-modal"
      labelledBy="reader-save-view-title"
      initialFocus={input}
      onDismiss={() => {
        if (!saving) {
          onCancel();
        }
      }}
    >
      <form
        className="library-save-dialog"
        aria-label={t({ message: "Save library view" })}
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim() && !saving) {
            onSave(name.trim());
          }
        }}
      >
        <h2 id="reader-save-view-title">
          <Trans>Save as a new view</Trans>
        </h2>
        <p>{description}</p>
        <label>
          <span>{t({ message: "Name", context: "LibraryViewSaveDialog interface" })}</span>
          <input
            className="mdbase-field"
            value={name}
            placeholder={placeholder}
            ref={input}
            disabled={saving}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <div>
          <button type="button" disabled={saving} onClick={onCancel}>
            <Trans context="Reader interface">Cancel</Trans>
          </button>
          <button type="submit" disabled={!name.trim() || saving}>
            {saving
              ? t({ message: "Saving…", context: "LibraryViewSaveDialog interface" })
              : t({ message: "Save view", context: "LibraryViewSaveDialog interface" })}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}
