import { serializeCslBibliography } from "@mdbase-reader/core";

import type { CslItem } from "@mdbase-reader/core";

/** Download implementation stays outside the document-opening graph. */
export async function saveBibliography(
  items: readonly CslItem[],
  saveFile: (name: string, blob: Blob) => Promise<void>,
): Promise<void> {
  await saveFile(
    "references.json",
    new Blob([serializeCslBibliography(items)], { type: "application/json" }),
  );
}
