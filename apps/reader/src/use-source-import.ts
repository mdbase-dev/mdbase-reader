import { useCallback, useEffect, useRef, useState } from "react";

import type { FileImportSuggestion } from "./file-import-suggestion.js";
import type { ReaderWorkspaceController } from "./use-reader-workspace.js";
import type { Source, SourceId, SourceImportProgress } from "@mdbase-reader/core";
import type { PickedFile } from "@mdbase-reader/platform";

export interface SourceImportFlow {
  readonly file: PickedFile | null;
  readonly importing: boolean;
  readonly progress: SourceImportProgress | null;
  readonly error: string | null;
  readonly choose: () => Promise<void>;
  readonly accept: (file: PickedFile) => void;
  readonly cancel: () => void;
  /** Imports the file; `useCitation` stores the suggested citation with it. */
  readonly importFile: (title: string, useCitation?: boolean) => Promise<void>;
  /** Details read from the file and looked up by its identifiers; null while reading. */
  readonly suggestion: FileImportSuggestion | null;
}

export function useSourceImport(
  workspace: ReaderWorkspaceController,
  pickSourceFile: (() => Promise<PickedFile | null>) | undefined,
  onImported: (sourceId: SourceId) => void,
): SourceImportFlow {
  const [file, setFile] = useState<PickedFile | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [progress, setProgress] = useState<SourceImportProgress | null>(null);
  const importController = useRef<AbortController | null>(null);
  const recoveryFile = useRef<PickedFile | null>(null);
  const suggestion = useFileSuggestion(file);
  const choose = useCallback(async (): Promise<void> => {
    if (!pickSourceFile) {
      return;
    }
    setPickError(null);
    try {
      const selected = await pickSourceFile();
      recoveryFile.current = null;
      setFile(selected);
    } catch (reason) {
      setPickError(
        reason instanceof Error ? reason.message : "Reader could not open the file picker.",
      );
    }
  }, [pickSourceFile]);
  const accept = useCallback((selected: PickedFile): void => {
    setPickError(null);
    recoveryFile.current = null;
    setFile(selected);
  }, []);
  const cancel = useCallback((): void => {
    if (importController.current) {
      if (progress?.phase === "creating") {
        return;
      }
      recoveryFile.current = file;
      importController.current.abort();
      setProgress(null);
      return;
    }
    recoveryFile.current = null;
    setFile(null);
  }, [file, progress?.phase]);
  const importFile = useCallback(
    async (title: string, useCitation = false): Promise<void> => {
      if (!file) {
        return;
      }
      const found = suggestion?.file === file ? suggestion.value : null;
      const controller = new AbortController();
      importController.current = controller;
      setProgress(null);
      try {
        const imported = await workspace.importSourceFile(importRequest(file, title, found), {
          signal: controller.signal,
          onProgress: setProgress,
          ...(recoveryFile.current === file ? { recoverExistingFiles: true } : {}),
        });
        if (imported) {
          recoveryFile.current = null;
          if (useCitation) {
            await storeSuggestedCitation(workspace, imported, found);
          }
          setFile(null);
          onImported(imported.id);
        } else if (!controller.signal.aborted) {
          recoveryFile.current = file;
        }
      } finally {
        if (importController.current === controller) {
          importController.current = null;
        }
        setProgress(null);
      }
    },
    [file, onImported, suggestion, workspace],
  );
  return {
    file,
    importing: workspace.importStatus === "importing",
    progress,
    error: workspace.importError ?? pickError,
    choose,
    accept,
    cancel,
    importFile,
    suggestion: suggestion?.file === file ? suggestion.value : null,
  };
}

function importRequest(
  file: PickedFile,
  title: string,
  found: FileImportSuggestion | null,
): Parameters<ReaderWorkspaceController["importSourceFile"]>[0] {
  return {
    name: file.name,
    declaredMediaType: file.mediaType,
    bytes: new Uint8Array(file.bytes),
    title,
    ...(found?.kind ? { kind: found.kind } : {}),
    ...(found ? { metadata: found.metadata } : {}),
  };
}

/** The source exists either way; a citation problem can be fixed in its citation panel. */
async function storeSuggestedCitation(
  workspace: Pick<ReaderWorkspaceController, "saveNewSourceCitation">,
  imported: Source,
  found: FileImportSuggestion | null,
): Promise<void> {
  const citation = found?.citation?.citation;
  if (citation && workspace.saveNewSourceCitation) {
    const fields = Object.fromEntries(Object.entries(citation).filter(([key]) => key !== "id"));
    await workspace.saveNewSourceCitation(imported, fields).catch(() => undefined);
  }
}

/** Reads a chosen file's details in the background; the dialog works without them. */
function useFileSuggestion(
  file: PickedFile | null,
): { readonly file: PickedFile; readonly value: FileImportSuggestion } | null {
  const [suggestion, setSuggestion] = useState<{
    readonly file: PickedFile;
    readonly value: FileImportSuggestion;
  } | null>(null);
  useEffect(() => {
    if (!file) {
      return;
    }
    const controller = new AbortController();
    void import("./file-import-suggestion.js")
      .then(({ suggestForFile }) =>
        suggestForFile(
          { name: file.name, mediaType: file.mediaType, bytes: new Uint8Array(file.bytes) },
          controller.signal,
        ),
      )
      .then((value) => {
        if (!controller.signal.aborted) {
          setSuggestion({ file, value });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setSuggestion({ file, value: { metadata: {} } });
        }
      });
    return () => controller.abort();
  }, [file]);
  return suggestion;
}
