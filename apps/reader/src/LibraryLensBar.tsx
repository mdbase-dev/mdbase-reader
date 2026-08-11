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
      <div className="library-filter-row">
        <details className="library-filter-menu">
          <summary>Filter{props.lens === "all" ? "" : " · 1"}</summary>
          <div>
            <label>
              <span>Reading view</span>
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
            </label>
            <SavedLenses
              {...props}
              naming={naming}
              name={name}
              setNaming={setNaming}
              setName={setName}
              finishSave={finishSave}
            />
          </div>
        </details>
        <label>
          <span>Sort</span>
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
        <label className="library-presentation-select">
          <span>View</span>
          <select
            value={props.presentation}
            onChange={(event) =>
              props.onPresentationChange(event.target.value as LibraryPresentation)
            }
          >
            <option value="compact">Compact</option>
            <option value="bibliography">Details</option>
            <option value="grid">Covers</option>
          </select>
        </label>
      </div>
      <div className="library-filter-summary">
        {props.lens !== "all" ? (
          <button type="button" onClick={() => props.onLensChange("all")}>
            {libraryLensLabel(props.lens)} <span aria-hidden="true">×</span>
          </button>
        ) : null}
        <span>{props.count}</span>
      </div>
    </div>
  );
}

function SavedLenses(
  props: LibraryLensBarProps & {
    readonly naming: boolean;
    readonly name: string;
    readonly setNaming: (value: boolean) => void;
    readonly setName: (value: string) => void;
    readonly finishSave: () => void;
  },
): JSX.Element {
  return (
    <div className="saved-lenses-list">
      <strong>Saved filters</strong>
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
      {props.naming ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            props.finishSave();
          }}
        >
          <input
            value={props.name}
            aria-label="Filter name"
            placeholder="Filter name"
            onChange={(event) => props.setName(event.target.value)}
          />
          <button type="submit" disabled={!props.name.trim()}>
            Save
          </button>
        </form>
      ) : (
        <button type="button" onClick={() => props.setNaming(true)}>
          Save current filter…
        </button>
      )}
    </div>
  );
}
