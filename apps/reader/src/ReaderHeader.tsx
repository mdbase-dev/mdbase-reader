import { ProductBrand, type ThemePreference } from "@mdbase-reader/ui";

import { PanelIcon, SearchIcon, ThemeIcon } from "./icons.js";

import type { JSX } from "react";

interface ReaderHeaderProps {
  readonly collectionName: string;
  readonly connectionState: "connected" | "offline" | "syncing";
  readonly theme: ThemePreference;
  readonly onChangeTheme: () => void;
  readonly onOpenCommands: () => void;
  readonly onToggleLibrary: () => void;
  readonly inspectorOpen: boolean;
  readonly onToggleInspector: () => void;
}

export function ReaderHeader({
  collectionName,
  connectionState,
  theme,
  onChangeTheme,
  onOpenCommands,
  onToggleLibrary,
  inspectorOpen,
  onToggleInspector,
}: ReaderHeaderProps): JSX.Element {
  return (
    <header className="reader-header">
      <div className="reader-header-brand">
        <button
          type="button"
          className="header-library-toggle"
          aria-label="Toggle library navigator"
          aria-controls="reader-library-navigator"
          onClick={onToggleLibrary}
        >
          <span />
        </button>
        <ProductBrand />
      </div>
      <div className="reader-header-context">
        <span className="collection-context" title={collectionName}>
          {collectionName}
        </span>
        <span className={`connection-state is-${connectionState}`}>{connectionState}</span>
      </div>
      <div className="reader-header-actions">
        <button
          className="header-command-button"
          type="button"
          aria-label="Search and commands"
          title="Search and commands · ⌘K"
          onClick={onOpenCommands}
        >
          <SearchIcon /> <span>Search</span> <kbd>⌘K</kbd>
        </button>
        <button
          className="icon-button header-inspector-toggle"
          type="button"
          aria-label="Toggle source tools"
          aria-controls="reader-source-tools"
          aria-pressed={inspectorOpen}
          onClick={onToggleInspector}
        >
          <PanelIcon />
        </button>
        <button
          className="icon-button"
          type="button"
          aria-label={`Theme: ${theme}. Change theme`}
          onClick={onChangeTheme}
        >
          <ThemeIcon />
        </button>
        <button
          className="profile-button"
          type="button"
          aria-label="Account and collection settings"
        >
          CB
        </button>
      </div>
    </header>
  );
}
