import { ProductBrand, type ThemePreference } from "@mdbase-reader/ui";

import { LeftPaneIcon, RightPaneIcon, SearchIcon, ThemeIcon } from "./icons.js";
import { importHref } from "./import-navigation.js";

import type { ReaderDirectAccessState } from "./use-direct-access.js";
import type { JSX } from "react";

interface ReaderHeaderProps {
  readonly density?: "comfortable" | "compact";
  readonly onToggleDensity?: () => void;
  readonly collectionName: string;
  readonly connectionState: "connected" | "offline" | "syncing";
  readonly directAccess: ReaderDirectAccessState;
  readonly theme: ThemePreference;
  readonly onChangeTheme: () => void;
  readonly onOpenCommands: () => void;
  readonly onToggleLibrary: () => void;
  readonly libraryOpen: boolean;
  readonly inspectorOpen: boolean;
  readonly inspectorAvailable: boolean;
  readonly onToggleInspector: () => void;
}

export function ReaderHeader({
  density = "comfortable",
  onToggleDensity,
  collectionName,
  connectionState,
  directAccess,
  theme,
  onChangeTheme,
  onOpenCommands,
  onToggleLibrary,
  libraryOpen,
  inspectorOpen,
  inspectorAvailable,
  onToggleInspector,
}: ReaderHeaderProps): JSX.Element {
  return (
    <header className="reader-header">
      <div className="reader-header-brand">
        <button
          type="button"
          className="icon-button header-pane-toggle is-library"
          aria-label="Toggle library navigator"
          aria-controls="reader-library-navigator"
          aria-expanded={libraryOpen}
          title="Toggle library navigator"
          onClick={onToggleLibrary}
        >
          <LeftPaneIcon />
        </button>
        <ProductBrand />
      </div>
      <div className="reader-header-context">
        <span className="collection-context" title={collectionName}>
          {collectionName}
        </span>
        <ConnectionState state={connectionState} directAccess={directAccess} />
      </div>
      <div className="reader-header-actions">
        <a
          className="header-command-button"
          href={importHref()}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Import a library (opens in a new tab)"
        >
          Import
        </a>
        {onToggleDensity ? (
          <button
            className="header-density-button"
            type="button"
            aria-label={`Interface density: ${density}. Change density`}
            title="Change interface density"
            onClick={onToggleDensity}
          >
            {density === "comfortable" ? "Aa" : "Aa−"}
          </button>
        ) : null}
        <button
          className="header-command-button"
          type="button"
          aria-label="Commands and quick source switcher"
          title="Commands and quick source switcher · Ctrl/⌘K"
          onClick={onOpenCommands}
        >
          <SearchIcon /> <span>Commands</span> <kbd>⌘K</kbd>
        </button>
        <button
          className="icon-button header-pane-toggle is-inspector"
          type="button"
          aria-label="Toggle source tools"
          aria-controls="reader-source-tools"
          aria-pressed={inspectorOpen}
          disabled={!inspectorAvailable}
          title={inspectorAvailable ? "Toggle source tools" : "Open a source to use source tools"}
          onClick={onToggleInspector}
        >
          <RightPaneIcon />
        </button>
        <button
          className="icon-button"
          type="button"
          aria-label={`Theme: ${theme}. Change theme`}
          onClick={onChangeTheme}
        >
          <ThemeIcon />
        </button>
      </div>
    </header>
  );
}

function ConnectionState({
  state,
  directAccess,
}: {
  readonly state: "connected" | "offline" | "syncing";
  readonly directAccess: ReaderDirectAccessState;
}): JSX.Element {
  const { snapshot, working, problem, request } = directAccess;
  if (snapshot?.authority !== "connector" || state !== "connected") {
    return <span className={`connection-state is-${state}`}>{state}</span>;
  }
  if (snapshot.route === "direct") {
    return (
      <span
        className="connection-state is-connected is-direct"
        title="Connected directly to this computer"
      >
        <span className="sr-only">Direct connection</span>
      </span>
    );
  }
  if (working || snapshot.status === "checking") {
    return (
      <span className="connection-state is-connected is-checking" aria-live="polite">
        Connecting…
      </span>
    );
  }
  if (snapshot.status === "disabled") {
    return <span className={`connection-state is-${state}`}>{state}</span>;
  }
  const denied = snapshot.status === "denied";
  const title =
    problem ??
    (denied
      ? "Local network access is blocked. Allow it in your browser’s site settings, then retry."
      : "Request local network access and connect directly to the mdbase relay on this computer.");
  return (
    <button
      className={`connection-state connection-direct-action${problem ? " has-problem" : ""}`}
      type="button"
      title={title}
      aria-label={title}
      onClick={request}
    >
      {denied ? "Retry local access" : "Connect directly"}
    </button>
  );
}
