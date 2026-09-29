import { useState, type JSX } from "react";

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
  return (
    <div
      className="library-save-dialog-backdrop"
      role="button"
      tabIndex={-1}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          onCancel();
        }
      }}
    >
      <form
        className="library-save-dialog"
        aria-label="Save library view"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim()) {
            onSave(name.trim());
          }
        }}
      >
        <h2>Save as a new view</h2>
        <p>{description}</p>
        <label>
          <span>Name</span>
          <input
            className="mdbase-field"
            value={name}
            placeholder={placeholder}
            // eslint-disable-next-line jsx-a11y/no-autofocus -- the dialog exists only to take this name.
            autoFocus
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <div>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" disabled={!name.trim() || saving}>
            {saving ? "Saving…" : "Save view"}
          </button>
        </div>
      </form>
    </div>
  );
}
