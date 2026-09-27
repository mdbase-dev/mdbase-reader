import { ChevronDownIcon, MdbaseMark, SettingsIcon } from "@mdbase-reader/ui";

import { readerLibraryUrl } from "./capture-model.js";
import { environment } from "./environment.js";

/**
 * The product brand, linking to the Reader library (on the selected collection, if any).
 * In the side panel it also names the collection, opening its controls, and links to
 * Settings, so neither needs a row of its own.
 */
export function ExtensionHeader({
  collectionId,
  collection,
  onSettings,
}: {
  readonly collectionId?: string | null;
  readonly collection?: {
    readonly name: string;
    readonly expanded: boolean;
    readonly onToggle: () => void;
  } | null;
  readonly onSettings?: () => void;
}): React.JSX.Element {
  return (
    <header className="extension-header">
      <a
        className="brand"
        href={readerLibraryUrl(collectionId)}
        target="_blank"
        rel="noreferrer"
        title="Open your library in mdbase Reader"
      >
        <MdbaseMark className="mark" />
        <strong>mdbase</strong>
        <span>reader</span>
      </a>
      <span className="header-end">
        {collection ? (
          <button
            type="button"
            className="header-collection"
            aria-expanded={collection.expanded}
            title={`Saving to ${collection.name}. Change collection`}
            onClick={collection.onToggle}
          >
            <span className="visually-hidden">Saving to </span>
            <span className="header-collection-name">{collection.name}</span>
            <ChevronDownIcon />
          </button>
        ) : null}
        {environment.label ? <span className="environment">{environment.label}</span> : null}
        {onSettings ? (
          <button
            type="button"
            className="header-icon"
            title="Settings and shortcuts"
            aria-label="Settings and shortcuts"
            onClick={onSettings}
          >
            <SettingsIcon />
          </button>
        ) : null}
      </span>
    </header>
  );
}
