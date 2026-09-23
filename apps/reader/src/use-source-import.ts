import { useCallback, useRef, useState } from "react";

import type { ReaderWorkspaceController } from "./use-reader-workspace.js";
import type { SourceId, SourceImportProgress } from "@mdbase-reader/core";
import type { PickedFile } from "@mdbase-reader/platform";

export interface SourceImportFlow {
  readonly file: PickedFile | null;
  readonly importing: boolean;
  readonly progress: SourceImportProgress | null;
  readonly error: string | null;
  readonly choose: () => Promise<void>;
  readonly accept: (file: PickedFile) => void;
  readonly cancel: () => void;
  readonly importFile: (title: string) => Promise<void>;
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
    async (title: string): Promise<void> => {
      if (!file) {
        return;
      }
      const controller = new AbortController();
      importController.current = controller;
      setProgress(null);
      try {
        const imported = await workspace.importSourceFile(
          {
            name: file.name,
            declaredMediaType: file.mediaType,
            bytes: new Uint8Array(file.bytes),
            title,
          },
          {
            signal: controller.signal,
            onProgress: setProgress,
            ...(recoveryFile.current === file ? { recoverExistingFiles: true } : {}),
          },
        );
        if (imported) {
          recoveryFile.current = null;
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
    [file, onImported, workspace],
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
  };
}
