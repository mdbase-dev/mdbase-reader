import { t as translate } from "@lingui/core/macro";

import { supportsChapterCreation } from "./source-parts-features.js";

import type { ReaderCommand, ReaderCommandInput } from "./reader-command-list.js";

export function libraryCommands(input: ReaderCommandInput): readonly ReaderCommand[] {
  return [
    {
      id: "open-library-view",
      label: translate({ message: "Open library", context: "reader app commands" }),
      group: "Library",
      run: () => input.workspace.openLibrary(),
    },
    {
      id: "search",
      label: translate({ message: "Filter sources in the sidebar" }),
      group: "Library",
      keywords: "search find",
      shortcut: "mod+shift+f",
      run: input.searchLibrary,
    },
    {
      id: "add-source",
      label: translate({ message: "Add source…", context: "reader app commands" }),
      group: "Library",
      keywords: "new import file pdf epub web page",
      run: input.addSource,
    },
    {
      id: "import-library",
      label: translate({ message: "Import a library…", context: "reader app commands" }),
      detail: translate({ message: "Opens in a new tab", context: "Reader command detail" }),
      group: "Library",
      keywords: "zotero readwise migrate",
      run: () => {
        globalThis.open(input.importHref, "_blank", "noopener,noreferrer");
      },
    },
    {
      id: "export-bibliography",
      label: translate({ message: "Export bibliography" }),
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
      label:
        theme === "system"
          ? translate({ message: "Match system theme" })
          : theme === "dark"
            ? translate`Use dark theme`
            : translate`Use light theme`,
      group: "Display",
      keywords: "appearance colour color mode",
      run: () => input.setTheme(theme),
    }));
  const density = input.density === "comfortable" ? "compact" : "comfortable";
  return [
    ...themes,
    {
      id: "density",
      label:
        density === "compact"
          ? translate({ message: "Use compact density" })
          : translate({ message: "Use comfortable density" }),
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
          label: translate({ message: "Add chapters as sources…" }),
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
      label: translate`Add chapters as sources… — ${source.title}`,
      detail: translate({ message: "Book chapters as sources" }),
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
          label: translate({ message: "Bookmark this position" }),
          group: "Current source",
          keywords: "bookmark page place mark annotation",
          run: input.bookmark,
        },
      ]
    : [];
}
