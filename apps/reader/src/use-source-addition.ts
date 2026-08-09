import { useCallback, useState } from "react";

import { useSourceImport, type SourceImportFlow } from "./use-source-import.js";
import { useWebCapture, type WebCaptureFlow } from "./use-web-capture.js";

import type { ReaderWorkspaceController } from "./use-reader-workspace.js";
import type { PickedFile } from "@mdbase-reader/platform";

export interface SourceAdditionController {
  readonly dialogOpen: boolean;
  readonly adding: boolean;
  readonly error: string | null;
  readonly fileImport: SourceImportFlow;
  readonly open: () => void;
  readonly close: () => void;
  readonly chooseFile: () => void;
  readonly capture: WebCaptureFlow["capture"];
  readonly clearError: () => void;
}

export function useSourceAddition(
  workspace: ReaderWorkspaceController,
  pickSourceFile: (() => Promise<PickedFile | null>) | undefined,
  onImported: () => void,
): SourceAdditionController {
  const [dialogOpen, setDialogOpen] = useState(false);
  const finish = useCallback((): void => {
    setDialogOpen(false);
    onImported();
  }, [onImported]);
  const fileImport = useSourceImport(workspace, pickSourceFile, finish);
  const webCapture = useWebCapture(workspace, finish);
  const close = useCallback((): void => setDialogOpen(false), []);
  return {
    dialogOpen,
    adding: fileImport.importing || webCapture.status === "capturing",
    error: webCapture.error,
    fileImport,
    open: () => {
      webCapture.clearError();
      setDialogOpen(true);
    },
    close,
    chooseFile: () => {
      setDialogOpen(false);
      void fileImport.choose();
    },
    capture: webCapture.capture,
    clearError: webCapture.clearError,
  };
}
