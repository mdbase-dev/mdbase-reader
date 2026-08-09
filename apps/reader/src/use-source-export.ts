import { useCallback, useState } from "react";

import { buildSourceExport } from "./build-source-export.js";
import { readerErrorMessage } from "./errors.js";

import type { AsyncResource } from "./use-reader-workspace.js";
import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type { Annotation, Source, SourceSummary } from "@mdbase-reader/core";

export type SourceExportStatus = "idle" | "exporting" | "success" | "error";

export interface SourceExportController {
  readonly available: boolean;
  readonly status: SourceExportStatus;
  readonly message: string | null;
  readonly run: () => void;
}

export function useSourceExport(input: {
  readonly gateway: ReaderWorkspaceGateway;
  readonly source: AsyncResource<Source>;
  readonly annotations: AsyncResource<readonly Annotation[]>;
  readonly citationSources: readonly SourceSummary[];
  readonly saveFile: ((name: string, blob: Blob) => Promise<void>) | undefined;
}): SourceExportController {
  const [state, setState] = useState<{
    readonly status: SourceExportStatus;
    readonly message: string | null;
  }>({ status: "idle", message: null });
  const available =
    Boolean(input.saveFile) &&
    input.source.status === "ready" &&
    input.annotations.status === "ready";
  const run = useCallback((): void => {
    if (
      !input.saveFile ||
      input.source.status !== "ready" ||
      input.annotations.status !== "ready"
    ) {
      setState({
        status: "error",
        message: "Open the source and its annotations before exporting.",
      });
      return;
    }
    const source = input.source.value;
    const annotations = input.annotations.value;
    setState({ status: "exporting", message: null });
    void buildSourceExport({
      source,
      annotations,
      citationSources: input.citationSources,
      readFile: (file, revision) => input.gateway.readFile(file, revision),
    })
      .then(async (bundle) => {
        await input.saveFile?.(bundle.fileName, bundle.blob);
        const problemCount = bundle.fileProblems.length + bundle.materializationProblems.length;
        setState({
          status: "success",
          message: problemCount
            ? `Exported with ${String(problemCount)} item${problemCount === 1 ? "" : "s"} to review.`
            : `Exported ${String(bundle.canonicalRecordCount)} record${bundle.canonicalRecordCount === 1 ? "" : "s"} and ${String(bundle.originalFileCount)} original file${bundle.originalFileCount === 1 ? "" : "s"}.`,
        });
      })
      .catch((reason: unknown) =>
        setState({
          status: "error",
          message: readerErrorMessage(reason, "Reader could not export this source."),
        }),
      );
  }, [input]);
  return { available, ...state, run };
}
