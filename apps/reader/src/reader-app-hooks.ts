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
import type { SourceSummary } from "@mdbase-reader/core";
import type { ReadingSurface } from "@mdbase-reader/reading-surface";

export function useResponsiveInspector(setInspectorOpen: (open: boolean) => void): void {
  useEffect(() => {
    const query = window.matchMedia("(max-width: 760px)");
    const update = (event: MediaQueryListEvent): void => setInspectorOpen(!event.matches);
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
  readonly reopenTab: () => void;
  readonly navigate: (direction: -1 | 1) => void;
}

export function useReaderShortcuts(actions: ReaderShortcutActions): void {
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent): void => handleReaderShortcut(event, actions);
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [actions]);
}

function handleReaderShortcut(event: KeyboardEvent, actions: ReaderShortcutActions): void {
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
  if (modifier && event.key.toLocaleLowerCase() === "k") {
    event.preventDefault();
    actions.openCommands();
    return true;
  }
  if (modifier && event.key.toLocaleLowerCase() === "f") {
    event.preventDefault();
    actions.focusSearch();
    return true;
  }
  if (modifier && event.shiftKey && event.key.toLocaleLowerCase() === "t") {
    event.preventDefault();
    actions.reopenTab();
    return true;
  }
  return false;
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

export function useThemePreference(): readonly [ThemePreference, () => void] {
  const [theme, setTheme] = useState<ThemePreference>(() => loadThemePreference(localStorage));
  useEffect(() => applyThemePreference(theme, document.documentElement), [theme]);
  const change = (): void => {
    const next = theme === "system" ? "light" : theme === "light" ? "dark" : "system";
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
  surface: ReadingSurface | null,
): AnnotationComposerController {
  return useAnnotationComposer({
    source: workspace.selectedSource,
    surface,
    create: workspace.createAnnotation,
  });
}

export function readerMainClass(
  libraryOpen: boolean,
  focusMode: boolean,
  inspectorOpen: boolean,
): string {
  return [
    "reader-main",
    libraryOpen ? "is-library-open" : "",
    focusMode ? "is-focus-mode" : "",
    !inspectorOpen ? "is-inspector-closed" : "",
  ]
    .filter(Boolean)
    .join(" ");
}
