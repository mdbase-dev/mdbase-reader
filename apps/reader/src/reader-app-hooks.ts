import {
  applyThemePreference,
  loadThemePreference,
  saveThemePreference,
  type ThemePreference,
} from "@mdbase-reader/ui";
import { useEffect, useMemo, useState } from "react";

import {
  useAnnotationComposer,
  type AnnotationComposerController,
} from "./use-annotation-composer.js";
import { useReadingResume, type ReadingResumeState } from "./use-reading-resume.js";

import type { LibraryFilter } from "./LibraryPane.js";
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

export function useReaderShortcuts(
  focusMode: boolean,
  setFocusMode: (value: boolean) => void,
): void {
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        document.querySelector<HTMLInputElement>("#reader-library-search")?.focus();
      } else if (event.key === "Escape" && focusMode) {
        setFocusMode(false);
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [focusMode, setFocusMode]);
}

export function useStatusFilteredSources(
  library: ReaderWorkspaceController["library"],
  filter: LibraryFilter,
): readonly SourceSummary[] {
  return useMemo(
    () =>
      library.status === "ready"
        ? library.value.sources.filter(
            ({ readingStatus }) => filter === "all" || (readingStatus ?? "inbox") === filter,
          )
        : [],
    [filter, library],
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
