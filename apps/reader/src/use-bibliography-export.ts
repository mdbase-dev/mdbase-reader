import { buildCslBibliography, serializeCslBibliography } from "@mdbase-reader/core";
import { useCallback, useMemo, useState } from "react";

import { readerErrorMessage } from "./errors.js";

import type { BibliographyProblemKind, SourceSummary } from "@mdbase-reader/core";

export type BibliographyExportStatus = "idle" | "exporting" | "success" | "error";

export interface BibliographyExportController {
  readonly itemCount: number;
  readonly problemCount: number;
  readonly problemSummary: string | null;
  readonly status: BibliographyExportStatus;
  readonly message: string | null;
  readonly run: () => void;
}

export function useBibliographyExport(
  sources: readonly SourceSummary[],
  saveFile: ((name: string, blob: Blob) => Promise<void>) | undefined,
): BibliographyExportController {
  const bibliography = useMemo(() => buildCslBibliography(sources), [sources]);
  const [state, setState] = useState<{
    readonly status: BibliographyExportStatus;
    readonly message: string | null;
  }>({ status: "idle", message: null });
  const run = useCallback((): void => {
    if (!saveFile) {
      setState({ status: "error", message: "File export is unavailable in this build." });
      return;
    }
    if (bibliography.items.length === 0) {
      setState({ status: "error", message: "No valid citations are ready to export." });
      return;
    }
    setState({ status: "exporting", message: null });
    const contents = serializeCslBibliography(bibliography.items);
    void saveFile("references.json", new Blob([contents], { type: "application/json" }))
      .then(() =>
        setState({
          status: "success",
          message: `Exported ${countLabel(bibliography.items.length, "citation")}.`,
        }),
      )
      .catch((reason: unknown) =>
        setState({
          status: "error",
          message: readerErrorMessage(reason, "Reader could not export the bibliography."),
        }),
      );
  }, [bibliography, saveFile]);

  return {
    itemCount: bibliography.items.length,
    problemCount: bibliography.problems.length,
    problemSummary: bibliographyProblemSummary(bibliography.problems),
    ...state,
    run,
  };
}

export function bibliographyProblemSummary(
  problems: readonly { readonly kind: BibliographyProblemKind }[],
): string | null {
  if (problems.length === 0) {
    return null;
  }
  const counts = { missing: 0, invalid: 0, duplicate: 0 };
  for (const { kind } of problems) {
    counts[kind] += 1;
  }
  return [
    counts.missing ? countLabel(counts.missing, "without citation") : null,
    counts.invalid ? countLabel(counts.invalid, "invalid record") : null,
    counts.duplicate ? countLabel(counts.duplicate, "citekey collision") : null,
  ]
    .filter((value): value is string => value !== null)
    .join(" · ");
}

function countLabel(count: number, singular: string): string {
  return `${String(count)} ${singular}${count === 1 ? "" : "s"}`;
}
