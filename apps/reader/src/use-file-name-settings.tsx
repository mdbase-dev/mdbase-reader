import { useCallback, useState, type JSX } from "react";

import { lazyFeature } from "./lazy-feature.js";

import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type { Annotation, SourceSummary } from "@mdbase-reader/core";

const FileNameSettings = lazyFeature(
  async () => ({ default: (await import("./FileNameSettings.js")).FileNameSettings }),
  "file name settings",
);

const previewCount = 3;

/**
 * The collection's file name settings, opened from the display menu. The dialog lives outside
 * the menu, which closes as it opens. Absent when the collection has no settings record support.
 */
export function useFileNameSettings(
  gateway: ReaderWorkspaceGateway,
  library: readonly SourceSummary[],
  openSources: readonly SourceSummary[],
): { readonly open: (() => void) | undefined; readonly dialog: JSX.Element | null } {
  const [opened, setOpened] = useState<readonly SourceSummary[] | null>(null);
  const settings = gateway.settings;
  const open = useCallback(() => {
    // The sources open now, then the library's first: a few the user knows.
    const seen = new Set<string>();
    setOpened(
      [...openSources, ...library]
        .filter((source) => !seen.has(source.id) && Boolean(seen.add(source.id)))
        .slice(0, previewCount),
    );
  }, [library, openSources]);
  const loadAnnotations = useCallback(async (): Promise<readonly Annotation[]> => {
    const found: Annotation[] = [];
    for (const source of opened ?? []) {
      found.push(...(await gateway.annotations(source.id)));
      if (found.length >= previewCount) {
        break;
      }
    }
    return found.slice(0, previewCount);
  }, [gateway, opened]);
  return {
    open: settings ? open : undefined,
    dialog:
      settings && opened ? (
        <FileNameSettings
          settings={settings}
          sources={opened}
          library={library}
          loadAnnotations={loadAnnotations}
          onClose={() => setOpened(null)}
        />
      ) : null,
  };
}
