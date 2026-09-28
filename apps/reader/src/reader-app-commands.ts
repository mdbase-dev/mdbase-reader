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
