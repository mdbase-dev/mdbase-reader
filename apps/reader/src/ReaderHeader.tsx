import { ProductBrand, type ThemePreference } from "@mdbase-reader/ui";

import { PanelIcon, SearchIcon, ThemeIcon } from "./icons.js";

import type { ReaderDirectAccessState } from "./use-direct-access.js";
import type { JSX } from "react";

interface ReaderHeaderProps {
  readonly collectionName: string;
  readonly connectionState: "connected" | "offline" | "syncing";
  readonly directAccess: ReaderDirectAccessState;
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
  directAccess,
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
        <ConnectionState state={connectionState} directAccess={directAccess} />
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
        direct
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
