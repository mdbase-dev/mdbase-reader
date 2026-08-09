import { useCallback, useState } from "react";

import type { ReaderWorkspaceController } from "./use-reader-workspace.js";
import type { PickedFile } from "@mdbase-reader/platform";

export interface SourceImportFlow {
  readonly file: PickedFile | null;
  readonly importing: boolean;
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
  const cancel = useCallback((): void => setFile(null), []);
  const importFile = useCallback(
    async (title: string): Promise<void> => {
      if (!file) {
        return;
      }
      const imported = await workspace.importSourceFile({
        name: file.name,
        declaredMediaType: file.mediaType,
        bytes: new Uint8Array(file.bytes),
        title,
      });
      if (imported) {
        setFile(null);
        onImported();
      }
    },
    [file, onImported, workspace],
  );
  return {
    file,
    importing: workspace.importStatus === "importing",
    error: workspace.importError ?? pickError,
    choose,
    cancel,
    importFile,
  };
}
