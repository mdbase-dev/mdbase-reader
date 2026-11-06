import {
  applyThemePreference,
  loadThemePreference,
  observeTheme,
  saveThemePreference,
  type ThemePreference,
} from "@mdbase-dev/ui/theme";
import { useEffect, useMemo, useState } from "react";

import { applyLibraryLens } from "./library-lenses.js";
import { sortLibrarySources } from "./library-view-state.js";
import { applyReaderThemeColor } from "./reader-theme-color.js";
import { startReaderStartupTiming } from "./startup-timing.js";
import {
  useAnnotationComposer,
  type AnnotationComposerController,
} from "./use-annotation-composer.js";
import { useReadingResume, type ReadingResumeState } from "./use-reading-resume.js";

import type { LibraryLensId } from "./library-lenses.js";
import type { LibrarySort } from "./library-view-state.js";
import type { ReaderWorkspaceController } from "./use-reader-workspace.js";
import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type { SourceId, SourceSummary } from "@mdbase-reader/core";
import type { ReadingSurface } from "@mdbase-reader/reading-surface";

export function useDocumentSurfaceTiming(
  sessionId: string | null,
  surface: ReadingSurface | null,
): void {
  const finish = useMemo(
    () => (sessionId ? startReaderStartupTiming("document-surface") : null),
    [sessionId],
  );
  useEffect(() => {
    if (surface) {
      finish?.();
    }
  }, [finish, surface]);
}

export function useResponsiveInspector(setInspectorOpen: (open: boolean) => void): void {
  useEffect(() => {
    const query = window.matchMedia("(max-width: 1120px)");
    const update = (event: MediaQueryListEvent): void => {
      if (event.matches) {
        setInspectorOpen(false);
      }
    };
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [setInspectorOpen]);
}

export interface ReaderShortcutActions {
  readonly focusMode: boolean;
  readonly setFocusMode: (value: boolean) => void;
  readonly openCommands: () => void;
  readonly openShortcuts: () => void;
  readonly focusSearch: () => void;
  readonly switchTab: (direction: -1 | 1) => void;
  readonly focusNextPane: () => void;
  readonly reopenTab: () => void;
  readonly navigate: (direction: -1 | 1) => void;
  readonly toggleSidebar: () => void;
  readonly toggleNotes: () => void;
  readonly addSource?: () => void;
}

export function useReaderShortcuts(actions: ReaderShortcutActions): void {
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent): void => handleReaderShortcut(event, actions);
    const focusPane = (event: KeyboardEvent): void => {
      if (event.key === "F6" && !document.querySelector('dialog[open], [aria-modal="true"]')) {
        event.preventDefault();
        event.stopPropagation();
        actions.focusNextPane();
      }
    };
    window.addEventListener("keydown", focusPane, true);
    window.addEventListener("keydown", handleShortcut);
    return () => {
      window.removeEventListener("keydown", focusPane, true);
      window.removeEventListener("keydown", handleShortcut);
    };
  }, [actions]);
}

function handleReaderShortcut(event: KeyboardEvent, actions: ReaderShortcutActions): void {
  if (event.defaultPrevented || document.querySelector('dialog[open], [aria-modal="true"]')) {
    return;
  }
  if (handleCommandShortcut(event, actions) || handleTabShortcut(event, actions)) {
    return;
  }
  if (handleHistoryShortcut(event, actions)) {
    return;
  }
  if (event.key === "Escape" && actions.focusMode) {
    actions.setFocusMode(false);
  }
}

function handleCommandShortcut(event: KeyboardEvent, actions: ReaderShortcutActions): boolean {
  const modifier = event.metaKey || event.ctrlKey;
  const editing =
    event.target instanceof Element &&
    Boolean(event.target.closest("input, select, textarea, [contenteditable='true']"));
  if (handleLibraryShortcut(event, actions, editing, modifier)) {
    return true;
  }
  if (asksForCommands(event, modifier, editing)) {
    event.preventDefault();
    actions.openCommands();
    return true;
  }
  if (isSlashSearch(event, editing)) {
    event.preventDefault();
    focusSearchForContext(actions);
    return true;
  }
  if (modifier && event.shiftKey && event.key.toLocaleLowerCase() === "f") {
    event.preventDefault();
    actions.focusSearch();
    return true;
  }
  if (modifier && !event.altKey && handleLayoutShortcut(event, actions)) {
    event.preventDefault();
    return true;
  }
  return false;
}

function handleLibraryShortcut(
  event: KeyboardEvent,
  actions: ReaderShortcutActions,
  editing: boolean,
  modifier: boolean,
): boolean {
  if ((modifier && event.key === "/") || (!editing && event.key === "?")) {
    event.preventDefault();
    actions.openShortcuts();
    return true;
  }
  if (editing || modifier || event.altKey) {
    return false;
  }
  if (isLibraryControlKey(event)) {
    return false;
  }
  const list = focusedLibraryList(event.target);
  if (!list) {
    return false;
  }
  if (["[", "a"].includes(event.key.toLowerCase())) {
    event.preventDefault();
    if (event.key === "[") {
      actions.toggleSidebar();
    } else {
      actions.addSource?.();
    }
    return true;
  }
  if (/^[jksx]$/iu.test(event.key) || ["Enter", "Delete", "F2"].includes(event.key)) {
    forwardLibraryRowKey(list, event);
    return true;
  }
  return false;
}

function isLibraryRowContext(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    Boolean(target.closest(".library-table-row:not(.is-header)")) &&
    !target.closest(
      "button, summary, a, [role=toolbar], [role=menu], [role^=menuitem], [role=separator]",
    )
  );
}

function isLibraryControlKey(event: KeyboardEvent): boolean {
  if (["Delete", "F2"].includes(event.key)) {
    return !isLibraryRowContext(event.target);
  }
  return (
    event.key === "Enter" &&
    event.target instanceof Element &&
    Boolean(event.target.closest("button, summary, a"))
  );
}

function focusedLibraryList(target: EventTarget | null): HTMLElement | null {
  const pane = document.querySelector<HTMLElement>(".workspace-pane.is-focused");
  if (target !== document.body && !(target instanceof Node && pane?.contains(target))) {
    return null;
  }
  return (
    pane?.querySelector<HTMLElement>(
      ".library-workspace .library-table, .library-workspace .library-card-grid",
    ) ?? null
  );
}

function forwardLibraryRowKey(list: HTMLElement, event: KeyboardEvent): void {
  const row = list.querySelector<HTMLElement>('.library-table-row:not(.is-header)[tabindex="0"]');
  if (!row) {
    return;
  }
  event.preventDefault();
  row.focus();
  if (!(event.target instanceof Element && event.target.closest(".library-table"))) {
    row.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: event.key,
        code: event.code,
        shiftKey: event.shiftKey,
        bubbles: true,
        cancelable: true,
      }),
    );
  }
}

/** Reading mode, the two side panels, and reopening a closed tab. */
function handleLayoutShortcut(event: KeyboardEvent, actions: ReaderShortcutActions): boolean {
  if (event.shiftKey && event.key.toLocaleLowerCase() === "t") {
    actions.reopenTab();
    return true;
  }
  if (event.key === ".") {
    actions.setFocusMode(!actions.focusMode);
    return true;
  }
  // The code, not the key, because Shift turns "\\" into "|" on most layouts.
  if (event.code !== "Backslash") {
    return false;
  }
  if (event.shiftKey) {
    actions.toggleNotes();
  } else {
    actions.toggleSidebar();
  }
  return true;
}

/** Mod+K in every mdbase app; "?" too, since the palette lists each command's shortcut. */
function asksForCommands(event: KeyboardEvent, modifier: boolean, editing: boolean): boolean {
  return modifier ? event.key.toLocaleLowerCase() === "k" : !editing && event.key === "?";
}

function isSlashSearch(event: KeyboardEvent, editing: boolean): boolean {
  return event.key === "/" && !editing && !event.metaKey && !event.ctrlKey && !event.altKey;
}

// In a library tab, "/" filters that view; elsewhere it opens source navigation.
function focusSearchForContext(actions: ReaderShortcutActions): void {
  const librarySearch = document.querySelector<HTMLInputElement>(
    ".workspace-pane.is-focused .library-search-field input",
  );
  if (librarySearch) {
    librarySearch.focus();
  } else {
    actions.focusSearch();
  }
}

function handleTabShortcut(event: KeyboardEvent, actions: ReaderShortcutActions): boolean {
  if (event.key !== "Tab" || !event.ctrlKey) {
    return false;
  }
  event.preventDefault();
  actions.switchTab(event.shiftKey ? -1 : 1);
  return true;
}

function handleHistoryShortcut(event: KeyboardEvent, actions: ReaderShortcutActions): boolean {
  if (!event.altKey || !["ArrowLeft", "ArrowRight"].includes(event.key)) {
    return false;
  }
  event.preventDefault();
  actions.navigate(event.key === "ArrowLeft" ? -1 : 1);
  return true;
}

export function useLensFilteredSources(
  library: ReaderWorkspaceController["library"],
  lens: LibraryLensId,
  sort: LibrarySort,
  recentSourceIds: readonly SourceSummary["id"][],
  annotatedSourceIds: ReadonlySet<SourceSummary["id"]>,
): readonly SourceSummary[] {
  return useMemo(
    () =>
      library.status === "ready"
        ? sortLibrarySources(
            applyLibraryLens(library.value.sources, lens, { recentSourceIds, annotatedSourceIds }),
            sort,
            recentSourceIds,
          )
        : [],
    [annotatedSourceIds, lens, library, recentSourceIds, sort],
  );
}

export function useThemePreference(): readonly [ThemePreference, (next: ThemePreference) => void] {
  const [theme, setTheme] = useState<ThemePreference>(() => loadThemePreference(localStorage));
  useEffect(() => {
    const root = document.documentElement;
    applyThemePreference(theme, root);
    // The shared package writes its own chrome colour; Reader's canvas is warmer.
    applyReaderThemeColor(root);
    return observeTheme(() => applyReaderThemeColor(root), root);
  }, [theme]);
  const change = (next: ThemePreference): void => {
    saveThemePreference(next, localStorage, document.documentElement);
    applyReaderThemeColor(document.documentElement);
    setTheme(next);
  };
  return [theme, change];
}

export function useReaderReadingResume(
  workspace: ReaderWorkspaceController,
  surface: ReadingSurface | null,
  activeSourceId: SourceId | null,
): ReadingResumeState {
  return useReadingResume({
    source:
      workspace.sourceRecord.status === "ready" &&
      workspace.sourceRecord.value.id === activeSourceId
        ? workspace.sourceRecord.value
        : null,
    surface,
    save: workspace.saveReadingPosition,
  });
}

export function useReaderAnnotationComposer(
  workspace: ReaderWorkspaceController,
  sourceId: SourceId | null,
  surface: ReadingSurface | null,
  gateway?: ReaderWorkspaceGateway,
): AnnotationComposerController {
  const source = workspace.sourceRecord.status === "ready" ? workspace.sourceRecord.value : null;
  return useAnnotationComposer({
    sourceId,
    source: source?.id === sourceId ? source : null,
    surface,
    create: workspace.createAnnotation,
    ...(workspace.annotationView
      ? {
          ownershipSources: workspace.annotationView.sources,
          revealAnnotation: workspace.annotationView.reveal,
        }
      : {}),
    ...(gateway ? { ownerGateway: gateway } : {}),
    annotations: workspace.annotations.status === "ready" ? workspace.annotations.value : [],
    planDeletion: workspace.planAnnotationDeletion,
    deleteAnnotation: workspace.deleteAnnotation,
    recolorAnnotation: workspace.recolorAnnotation,
  });
}
