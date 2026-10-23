import { t } from "@lingui/core/macro";

import type { ReaderCommand, ReaderCommandInput } from "./reader-command-list.js";

export function libraryCommands(input: ReaderCommandInput): readonly ReaderCommand[] {
  return [
    {
      id: "open-library-view",
      label: t({ message: "Open library", context: "reader app commands" }),
      group: "Library",
      run: () => input.workspace.openLibrary(),
    },
    {
      id: "search",
      label: t({ message: "Filter sources in the sidebar" }),
      group: "Library",
      keywords: "search find",
      shortcut: "mod+shift+f",
      run: input.searchLibrary,
    },
    {
      id: "add-source",
      label: t({ message: "Add source…", context: "reader app commands" }),
      group: "Library",
      keywords: "new import file pdf epub web page",
      run: input.addSource,
    },
    {
      id: "import-library",
      label: t({ message: "Import a library…", context: "reader app commands" }),
      detail: t({ message: "Opens in a new tab" }),
      group: "Library",
      keywords: "zotero readwise migrate",
      run: () => {
        globalThis.open(input.importHref, "_blank", "noopener,noreferrer");
      },
    },
    {
      id: "export-bibliography",
      label: t({ message: "Export bibliography" }),
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
          ? t({ message: "Match system theme" })
          : theme === "dark"
            ? t`Use dark theme`
            : t`Use light theme`,
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
          ? t({ message: "Use compact density" })
          : t({ message: "Use comfortable density" }),
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
          label: t({ message: "Bookmark this position" }),
          group: "Current source",
          keywords: "bookmark page place mark annotation",
          run: input.bookmark,
        },
      ]
    : [];
}
