import {
  applyThemePreference,
  loadThemePreference,
  saveThemePreference,
  type ThemePreference,
} from "@mdbase-reader/ui";
import { useEffect, useMemo, useState } from "react";

import { applyLibraryLens } from "./library-lenses.js";
import { sortLibrarySources } from "./library-view-state.js";
import {
  useAnnotationComposer,
  type AnnotationComposerController,
} from "./use-annotation-composer.js";
import { useReadingResume, type ReadingResumeState } from "./use-reading-resume.js";

import type { LibraryLensId } from "./library-lenses.js";
import type { LibrarySort } from "./library-view-state.js";
import type { ReaderWorkspaceController } from "./use-reader-workspace.js";
import type { SourceId, SourceSummary } from "@mdbase-reader/core";
import type { ReadingSurface } from "@mdbase-reader/reading-surface";

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

export function useFocusChrome(focusMode: boolean): boolean {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (!focusMode) {
      return undefined;
    }
    let timer = globalThis.setTimeout(() => setVisible(false), 1400);
    const reveal = (): void => {
      setVisible(true);
      globalThis.clearTimeout(timer);
      timer = globalThis.setTimeout(() => setVisible(false), 1400);
    };
    globalThis.addEventListener("pointermove", reveal);
    globalThis.addEventListener("keydown", reveal);
    return () => {
      globalThis.clearTimeout(timer);
      globalThis.removeEventListener("pointermove", reveal);
      globalThis.removeEventListener("keydown", reveal);
    };
  }, [focusMode]);
  return !focusMode || visible;
}

export interface ReaderShortcutActions {
  readonly focusMode: boolean;
  readonly setFocusMode: (value: boolean) => void;
  readonly openCommands: () => void;
  readonly focusSearch: () => void;
  readonly switchTab: (direction: -1 | 1) => void;
  readonly focusNextPane: () => void;
  readonly reopenTab: () => void;
  readonly navigate: (direction: -1 | 1) => void;
  readonly toggleSidebar: () => void;
  readonly toggleNotes: () => void;
}

export function useReaderShortcuts(actions: ReaderShortcutActions): void {
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent): void => handleReaderShortcut(event, actions);
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [actions]);
}

function handleReaderShortcut(event: KeyboardEvent, actions: ReaderShortcutActions): void {
  if (event.defaultPrevented) {
    return;
  }
  if (handleCommandShortcut(event, actions) || handleTabShortcut(event, actions)) {
    return;
  }
  if (handleHistoryShortcut(event, actions)) {
    return;
  }
  if (event.key === "F6") {
    event.preventDefault();
    actions.focusNextPane();
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
    Boolean(event.target.closest("input, textarea, [contenteditable='true']"));
  if (modifier && !editing && event.key.toLocaleLowerCase() === "k") {
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

function isSlashSearch(event: KeyboardEvent, editing: boolean): boolean {
  return event.key === "/" && !editing && !event.metaKey && !event.ctrlKey && !event.altKey;
}

// In a library tab, "/" searches that view; elsewhere it filters the sidebar.
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
  useEffect(() => applyThemePreference(theme, document.documentElement), [theme]);
  const change = (next: ThemePreference): void => {
    saveThemePreference(next, localStorage, document.documentElement);
    setTheme(next);
  };
  return [theme, change];
}

export function useReaderReadingResume(
  workspace: ReaderWorkspaceController,
  surface: ReadingSurface | null,
): ReadingResumeState {
  return useReadingResume({
    source: workspace.sourceRecord.status === "ready" ? workspace.sourceRecord.value : null,
    surface,
    save: workspace.saveReadingPosition,
  });
}

export function useReaderAnnotationComposer(
  workspace: ReaderWorkspaceController,
  sourceId: SourceId | null,
  surface: ReadingSurface | null,
): AnnotationComposerController {
  const source = workspace.sourceRecord.status === "ready" ? workspace.sourceRecord.value : null;
  return useAnnotationComposer({
    sourceId,
    source: source?.id === sourceId ? source : null,
    surface,
    create: workspace.createAnnotation,
    annotations: workspace.annotations.status === "ready" ? workspace.annotations.value : [],
  });
}
