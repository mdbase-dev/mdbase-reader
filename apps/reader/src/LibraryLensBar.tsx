import { useState, type JSX } from "react";

import { libraryLensIds, libraryLensLabel } from "./library-lenses.js";

import type { LibraryLensId } from "./library-lenses.js";
import type { LibrarySort, SavedLibraryLens } from "./library-view-state.js";
import type { LibraryPresentation } from "./workspace-shell-preferences.js";

export interface LibraryLensBarProps {
  readonly lens: LibraryLensId;
  readonly sort: LibrarySort;
  readonly savedLenses: readonly SavedLibraryLens[];
  readonly count: string;
  readonly presentation: LibraryPresentation;
  readonly onLensChange: (lens: LibraryLensId) => void;
  readonly onSortChange: (sort: LibrarySort) => void;
  readonly onSaveLens: (name: string) => void;
  readonly onApplySavedLens: (id: string) => void;
  readonly onRemoveSavedLens: (id: string) => void;
  readonly onPresentationChange: (presentation: LibraryPresentation) => void;
}

export function LibraryLensBar(props: LibraryLensBarProps): JSX.Element {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const finishSave = (): void => {
    props.onSaveLens(name);
    setName("");
    setNaming(false);
  };
  return (
    <div className="library-lens-bar">
      <div className="library-lens-selectors">
        <label>
          <span className="sr-only">Library lens</span>
          <select
            value={props.lens}
            onChange={(event) => props.onLensChange(event.target.value as LibraryLensId)}
          >
            {libraryLensIds.map((id) => (
              <option key={id} value={id}>
                {libraryLensLabel(id)}
              </option>
            ))}
          </select>
          <small>{props.count}</small>
        </label>
        <label>
          <span className="sr-only">Sort sources</span>
          <select
            value={props.sort}
            onChange={(event) => props.onSortChange(event.target.value as LibrarySort)}
          >
            <option value="recent">Recent</option>
            <option value="title">Title</option>
            <option value="creator">Creator</option>
            <option value="published">Published</option>
          </select>
        </label>
      </div>
      <div className="library-view-actions">
        <details className="saved-lenses">
          <summary title="Saved library lenses">Lenses</summary>
          <div>
            {props.savedLenses.map((item) => (
              <span key={item.id}>
                <button type="button" onClick={() => props.onApplySavedLens(item.id)}>
                  {item.name}
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${item.name}`}
                  onClick={() => props.onRemoveSavedLens(item.id)}
                >
                  ×
                </button>
              </span>
            ))}
            {naming ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  finishSave();
                }}
              >
                <input
                  value={name}
                  aria-label="Lens name"
                  placeholder="Lens name"
                  onChange={(event) => setName(event.target.value)}
                />
                <button type="submit" disabled={!name.trim()}>
                  Save
                </button>
              </form>
            ) : (
              <button type="button" onClick={() => setNaming(true)}>
                Save current lens…
              </button>
            )}
          </div>
        </details>
        <div aria-label="Library presentation">
          {(["compact", "bibliography", "grid"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={props.presentation === mode}
              title={`${mode} view`}
              onClick={() => props.onPresentationChange(mode)}
            >
              {mode === "compact" ? "≡" : mode === "bibliography" ? "☷" : "▦"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
