import { supportsChapterCreation } from "./source-parts-features.js";

import type { ReaderCommand, ReaderCommandInput } from "./reader-command-list.js";

export function libraryCommands(input: ReaderCommandInput): readonly ReaderCommand[] {
  return [
    {
      id: "open-library-view",
      label: "Open library",
      group: "Library",
      run: () => input.workspace.openLibrary(),
    },
    {
      id: "search",
      label: "Filter sources in the sidebar",
      group: "Library",
      keywords: "search find",
      shortcut: "mod+shift+f",
      run: input.searchLibrary,
    },
    {
      id: "add-source",
      label: "Add source…",
      group: "Library",
      keywords: "new import file pdf epub web page",
      run: input.addSource,
    },
    {
      id: "import-library",
      label: "Import a library…",
      detail: "Opens in a new tab",
      group: "Library",
      keywords: "zotero readwise migrate",
      run: () => {
        globalThis.open(input.importHref, "_blank", "noopener,noreferrer");
      },
    },
    {
      id: "export-bibliography",
      label: "Export bibliography",
      group: "Library",
      run: input.bibliographyExport.run,
    },
  ];
}

export function displayCommands(input: ReaderCommandInput): readonly ReaderCommand[] {
  const themes = (["system", "light", "dark"] as const)
    .filter((theme) => theme !== input.theme)
    .map((theme): ReaderCommand => ({
      id: `theme:${theme}`,
      label: theme === "system" ? "Match system theme" : `Use ${theme} theme`,
      group: "Display",
      keywords: "appearance colour color mode",
      run: () => input.setTheme(theme),
    }));
  const density = input.density === "comfortable" ? "compact" : "comfortable";
  return [
    ...themes,
    {
      id: "density",
      label: density === "compact" ? "Use compact density" : "Use comfortable density",
      group: "Display",
      keywords: "size text spacing",
      run: () => input.setDensity(density),
    },
  ];
}

const chapterKeywords = "book chapter parts pdf epub table of contents";

/** Chapter creation for the current source, when it is a PDF or EPUB. */
export function chapterCommands(input: ReaderCommandInput): readonly ReaderCommand[] {
  const source = input.activeSource;
  const create = input.createSourceParts;
  return source && create && supportsChapterCreation(source)
    ? [
        {
          id: "add-chapters-as-sources",
          label: "Add chapters as sources…",
          detail: source.title,
          group: "Current source",
          keywords: chapterKeywords,
          run: () => create(source),
        },
      ]
    : [];
}

/**
 * Without a current PDF or EPUB (the Library is focused, or nothing has been opened yet), each
 * book in the library offers chapter creation instead. They sit with the sources, which the
 * palette lists only for a search, so browsing is not crowded.
 */
export function libraryChapterCommands(input: ReaderCommandInput): readonly ReaderCommand[] {
  const create = input.createSourceParts;
  if (!create || (input.activeSource && supportsChapterCreation(input.activeSource))) {
    return [];
  }
  return input.sources
    .filter((source) => !source.partOf && supportsChapterCreation(source))
    .map((source) => ({
      id: `add-chapters-as-sources:${source.id}`,
      label: `Add chapters to ${source.title}…`,
      detail: "Book chapters as sources",
      group: "Sources",
      keywords: chapterKeywords,
      run: () => create(source),
    }));
}

export function annotationCommands(input: ReaderCommandInput): readonly ReaderCommand[] {
  return input.bookmark
    ? [
        {
          id: "bookmark",
          label: "Bookmark this position",
          group: "Current source",
          keywords: "bookmark page place mark annotation",
          run: input.bookmark,
        },
      ]
    : [];
}
