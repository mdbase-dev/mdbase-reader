import { useCallback, useRef, useState } from "react";

import type { ReaderWorkspaceController } from "./use-reader-workspace.js";
import type { SourceImportProgress } from "@mdbase-reader/core";
import type { PickedFile } from "@mdbase-reader/platform";

export interface SourceImportFlow {
  readonly file: PickedFile | null;
  readonly importing: boolean;
  readonly progress: SourceImportProgress | null;
  readonly error: string | null;
  readonly choose: () => Promise<void>;
  readonly cancel: () => void;
  readonly importFile: (title: string) => Promise<void>;
}

export function useSourceImport(
  workspace: ReaderWorkspaceController,
  pickSourceFile: (() => Promise<PickedFile | null>) | undefined,
  onImported: () => void,
): SourceImportFlow {
  const [file, setFile] = useState<PickedFile | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [progress, setProgress] = useState<SourceImportProgress | null>(null);
  const importController = useRef<AbortController | null>(null);
  const choose = useCallback(async (): Promise<void> => {
    if (!pickSourceFile) {
      return;
    }
    setPickError(null);
    try {
      setFile(await pickSourceFile());
    } catch (reason) {
      setPickError(
        reason instanceof Error ? reason.message : "Reader could not open the file picker.",
      );
    }
  }, [pickSourceFile]);
  const cancel = useCallback((): void => {
    if (importController.current) {
      if (progress?.phase === "creating") {
        return;
      }
      importController.current.abort();
      setProgress(null);
      return;
    }
    setFile(null);
  }, [progress?.phase]);
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
          { signal: controller.signal, onProgress: setProgress },
        );
        if (imported) {
          setFile(null);
          onImported();
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
    cancel,
    importFile,
  };
}
