import { useMemo } from "react";

import { libraryViewConfiguration } from "./mdbase-library-views.js";
import { useLayoutDraft } from "./use-layout-draft.js";

import type { LibraryViewConfiguration, MdbaseLibraryView } from "./mdbase-library-views.js";

/** The parts of a view the reader arranges by hand: remembered on this device until saved. */
export type LibraryLayout = Pick<
  LibraryViewConfiguration,
  "presentation" | "columns" | "columnWidths" | "sortField" | "sortDirection"
>;

const prefix = "mdbase-reader:library-layout:v1:";

export function layoutOf(configuration: LibraryViewConfiguration): LibraryLayout {
  const { presentation, columns, columnWidths, sortField, sortDirection } = configuration;
  return { presentation, columns, columnWidths, sortField, sortDirection };
}

export function sameLayout(left: LibraryLayout, right: LibraryLayout): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Keeps column, width, sort and layout changes for a view across reloads on this device.
 * Saving the view writes them to its mdbase file; the built-in view keeps them here.
 */
export function useLibraryLayoutDraft(
  collectionKey: string,
  view: MdbaseLibraryView,
): readonly [LibraryLayout, (layout: LibraryLayout) => void] {
  const saved = useMemo(() => layoutOf(view.configuration), [view.configuration]);
  return useLayoutDraft(`${prefix}${collectionKey}:${view.key}`, view.revision, saved, (stored) => {
    const layout = stored as Partial<LibraryLayout>;
    // Validate through the same parser the view file uses.
    return layoutOf(
      libraryViewConfiguration({
        type: layout.presentation,
        options: { ...layout, filter: view.configuration.filter },
      }),
    );
  });
}
