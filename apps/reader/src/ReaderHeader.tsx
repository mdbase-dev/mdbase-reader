import { AppSwitcher } from "@mdbase-dev/ui/app-switcher";

import { CollectionPicker } from "./CollectionPicker.js";
import { DisplayMenu } from "./DisplayMenu.js";
import { BackIcon, LeftPaneIcon, ReadingModeIcon, RightPaneIcon, SearchIcon } from "./icons.js";
import { shortcutLabel } from "./Menu.js";

import type { ReaderDirectAccessState } from "./use-direct-access.js";
import type { ThemePreference } from "@mdbase-dev/ui/theme";
import type { ReadingTypography } from "@mdbase-reader/reading-surface";
import type { JSX, ReactNode } from "react";

/**
 * A phone showing a source has room for one bar: back to the library, the open tabs, and the
 * source's own actions. The collection and sidebars belong to the library screen.
 */
export interface ReaderHeaderSourceBar {
  readonly onBack: () => void;
  readonly switcher: ReactNode;
  readonly actions: ReactNode;
}

interface ReaderHeaderProps {
  readonly typography?: ReadingTypography;
  readonly onChangeTypography?: (typography: ReadingTypography) => void;
  readonly sidebarWhileReading?: "hide" | "keep";
  readonly onChangeSidebarWhileReading?: (value: "hide" | "keep") => void;
  readonly readingMode?: boolean;
  readonly readingModeAvailable?: boolean;
  readonly onToggleReadingMode?: () => void;
  readonly density?: "comfortable" | "compact";
  readonly onChangeDensity?: (density: "comfortable" | "compact") => void;
  readonly collectionName: string;
  readonly beforeCollectionSwitch?: () => boolean;
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
  readonly sourceBar?: ReaderHeaderSourceBar | undefined;
}

/** Local builds point the app menu at local copies of the other apps. */
const appUrls = {
  editor: import.meta.env.VITE_MDBASE_EDITOR_URL,
  reader: import.meta.env.VITE_MDBASE_READER_URL,
  writer: import.meta.env.VITE_MDBASE_WRITER_URL,
};

export function ReaderHeader(props: ReaderHeaderProps): JSX.Element {
  const display = <HeaderDisplayMenu {...props} />;
  return props.sourceBar ? (
    <SourceBarHeader bar={props.sourceBar} display={display} />
  ) : (
    <LibraryHeader {...props} display={display} />
  );
}

function HeaderDisplayMenu({
  typography,
  onChangeTypography,
  sidebarWhileReading = "hide",
  onChangeSidebarWhileReading,
  density = "comfortable",
  onChangeDensity,
  theme,
  onChangeTheme,
}: ReaderHeaderProps): JSX.Element {
  return (
    <DisplayMenu
      theme={theme}
      onChangeTheme={onChangeTheme}
      density={density}
      sidebarWhileReading={sidebarWhileReading}
      {...(typography && onChangeTypography ? { typography, onChangeTypography } : {})}
      {...(onChangeDensity ? { onChangeDensity } : {})}
      {...(onChangeSidebarWhileReading ? { onChangeSidebarWhileReading } : {})}
    />
  );
}

/** The full header, for the library and for every pane arrangement wider than a phone. */
function LibraryHeader({
  readingMode = false,
  readingModeAvailable = false,
  onToggleReadingMode,
  collectionName,
  beforeCollectionSwitch,
  connectionState,
  directAccess,
  onOpenCommands,
  onToggleLibrary,
  libraryOpen,
  inspectorOpen,
  inspectorAvailable,
  onToggleInspector,
  display,
}: ReaderHeaderProps & { readonly display: ReactNode }): JSX.Element {
  return (
    <header className="reader-header">
      <div className="reader-header-brand">
        <button
          type="button"
          className="icon-button header-pane-toggle is-library"
          aria-label="Toggle left sidebar"
          aria-expanded={libraryOpen}
          title={`Toggle left sidebar · ${shortcutLabel("mod+\\")}`}
          onClick={onToggleLibrary}
        >
          <LeftPaneIcon />
        </button>
        <AppSwitcher current="reader" urls={appUrls} />
      </div>
      <div className="reader-header-context">
        <CollectionPicker
          name={collectionName}
          {...(beforeCollectionSwitch ? { beforeSwitch: beforeCollectionSwitch } : {})}
        />
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
        {onToggleReadingMode ? (
          <button
            className="icon-button header-reading-mode"
            type="button"
            aria-label="Reading mode"
            aria-pressed={readingMode}
            disabled={!readingModeAvailable && !readingMode}
            title={
              readingModeAvailable || readingMode
                ? `${readingMode ? "Leave" : "Enter"} reading mode · ${shortcutLabel("mod+.")}`
                : "Open a document to use reading mode"
            }
            onClick={onToggleReadingMode}
          >
            <ReadingModeIcon />
          </button>
        ) : null}
        {display}
        <button
          className="icon-button header-pane-toggle is-inspector"
          type="button"
          aria-label="Toggle right sidebar"
          aria-pressed={inspectorOpen}
          disabled={!inspectorAvailable}
          title={`Toggle right sidebar · ${shortcutLabel("mod+shift+\\")}`}
          onClick={onToggleInspector}
        >
          <RightPaneIcon />
        </button>
      </div>
    </header>
  );
}

function SourceBarHeader({
  bar,
  display,
}: {
  readonly bar: ReaderHeaderSourceBar;
  readonly display: ReactNode;
}): JSX.Element {
  return (
    <header className="reader-header is-source-bar">
      <button
        type="button"
        className="icon-button header-back"
        aria-label="Back to library"
        title="Back to library"
        onClick={bar.onBack}
      >
        <BackIcon />
      </button>
      <div className="reader-header-context">{bar.switcher}</div>
      <div className="reader-header-actions">
        {display}
        {bar.actions}
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
