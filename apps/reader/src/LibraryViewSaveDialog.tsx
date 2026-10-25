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
        aria-label="Save library view"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim() && !saving) {
            onSave(name.trim());
          }
        }}
      >
        <h2 id="reader-save-view-title">Save as a new view</h2>
        <p>{description}</p>
        <label>
          <span>Name</span>
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
            Cancel
          </button>
          <button type="submit" disabled={!name.trim() || saving}>
            {saving ? "Saving…" : "Save view"}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}
