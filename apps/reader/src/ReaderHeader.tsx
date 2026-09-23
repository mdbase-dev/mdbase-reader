import { ProductBrand, themePreferences, type ThemePreference } from "@mdbase-reader/ui";

import { LeftPaneIcon, RightPaneIcon, SearchIcon } from "./icons.js";
import { Menu, shortcutLabel } from "./Menu.js";

import type { ReaderDirectAccessState } from "./use-direct-access.js";
import type { JSX } from "react";

interface ReaderHeaderProps {
  readonly density?: "comfortable" | "compact";
  readonly onChangeDensity?: (density: "comfortable" | "compact") => void;
  readonly collectionName: string;
  readonly connectionState: "connected" | "offline" | "syncing";
  readonly directAccess: ReaderDirectAccessState;
  readonly theme: ThemePreference;
  readonly onChangeTheme: (theme: ThemePreference) => void;
  readonly onOpenCommands: () => void;
  readonly onToggleLibrary: () => void;
  readonly libraryOpen: boolean;
  readonly inspectorOpen: boolean;
  readonly inspectorAvailable: boolean;
  readonly onToggleInspector: () => void;
}

export function ReaderHeader({
  density = "comfortable",
  onChangeDensity,
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
          title="Toggle library"
          onClick={onToggleLibrary}
        >
          <LeftPaneIcon />
        </button>
        <ProductBrand />
      </div>
      <div className="reader-header-context">
        <span className="collection-context" title={`Collection: ${collectionName}`}>
          {collectionName}
        </span>
        <ConnectionState state={connectionState} directAccess={directAccess} />
      </div>
      <div className="reader-header-actions">
        <button
          className="header-command-button"
          type="button"
          aria-label="Search and commands"
          title={`Search sources and run commands · ${shortcutLabel("mod+k")}`}
          onClick={onOpenCommands}
        >
          <SearchIcon />
          <span>Search</span>
          <kbd>{shortcutLabel("mod+k")}</kbd>
        </button>
        <Menu
          className="header-display-menu"
          label="Display settings"
          triggerClassName="icon-button header-display-trigger"
          trigger={<span aria-hidden="true">Aa</span>}
        >
          <DisplayChoice
            legend="Theme"
            value={theme}
            options={themePreferences.map((value) => ({ value, label: capitalize(value) }))}
            onChange={onChangeTheme}
          />
          {onChangeDensity ? (
            <DisplayChoice
              legend="Density"
              value={density}
              options={[
                { value: "comfortable", label: "Comfortable" },
                { value: "compact", label: "Compact" },
              ]}
              onChange={onChangeDensity}
            />
          ) : null}
        </Menu>
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
      </div>
    </header>
  );
}

function DisplayChoice<T extends string>({
  legend,
  value,
  options,
  onChange,
}: {
  readonly legend: string;
  readonly value: T;
  readonly options: readonly { readonly value: T; readonly label: string }[];
  readonly onChange: (value: T) => void;
}): JSX.Element {
  return (
    <fieldset className="display-choice" data-menu-keep-open>
      <legend>{legend}</legend>
      <div className="segmented-control">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function capitalize(value: string): string {
  return value.charAt(0).toLocaleUpperCase() + value.slice(1);
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
    return <PlainConnectionState state={state} />;
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
    return <PlainConnectionState state={state} />;
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

const connectionLabels = {
  connected: "Connected",
  offline: "Offline",
  syncing: "Syncing…",
} as const;

function PlainConnectionState({
  state,
}: {
  readonly state: "connected" | "offline" | "syncing";
}): JSX.Element {
  // Connected is the normal state: a quiet dot, with the words kept for assistive technology.
  return (
    <span className={`connection-state is-${state}`} title={connectionLabels[state]}>
      <span className={state === "connected" ? "sr-only" : undefined}>
        {connectionLabels[state]}
      </span>
    </span>
  );
}
