import { useCallback, useState } from "react";

import { useSourceImport, type SourceImportFlow } from "./use-source-import.js";
import { useWebCapture, type WebCaptureFlow } from "./use-web-capture.js";

import type { ReaderWorkspaceController } from "./use-reader-workspace.js";
import type { SourceId } from "@mdbase-reader/core";
import type { PickedFile } from "@mdbase-reader/platform";

export interface SourceAdditionController {
  readonly dialogOpen: boolean;
  readonly adding: boolean;
  readonly error: string | null;
  readonly fileImport: SourceImportFlow;
  readonly open: () => void;
  readonly close: () => void;
  readonly chooseFile: () => void;
  /** Adds a file dropped onto Reader, after checking it is a readable format. */
  readonly addFile: (file: File) => Promise<void>;
  readonly capture: WebCaptureFlow["capture"];
  readonly clearError: () => void;
}

export function useSourceAddition(
  workspace: ReaderWorkspaceController,
  pickSourceFile: (() => Promise<PickedFile | null>) | undefined,
  onImported: (sourceId: SourceId) => void,
): SourceAdditionController {
  const [dialogOpen, setDialogOpen] = useState(false);
  const finish = useCallback(
    (sourceId: SourceId): void => {
      setDialogOpen(false);
      onImported(sourceId);
    },
    [onImported],
  );
  const fileImport = useSourceImport(workspace, pickSourceFile, finish);
  const webCapture = useWebCapture(workspace, finish);
  const [dropError, setDropError] = useState<string | null>(null);
  const close = useCallback((): void => setDialogOpen(false), []);
  const acceptFile = fileImport.accept;
  const addFile = useCallback(
    async (file: File): Promise<void> => {
      const mediaType = droppedMediaType(file);
      if (!mediaType) {
        setDropError(`${file.name} isn’t a PDF, EPUB or saved web page.`);
        setDialogOpen(true);
        return;
      }
      setDropError(null);
      const bytes = await file.arrayBuffer();
      setDialogOpen(false);
      acceptFile({ name: file.name, mediaType, size: file.size, bytes });
    },
    [acceptFile],
  );
  return {
    dialogOpen,
    adding: fileImport.importing || webCapture.status === "capturing",
    error: dropError ?? webCapture.error,
    fileImport,
    open: () => {
      webCapture.clearError();
      setDropError(null);
      setDialogOpen(true);
    },
    close,
    chooseFile: () => {
      setDialogOpen(false);
      void fileImport.choose();
    },
    addFile,
    capture: webCapture.capture,
    clearError: () => {
      setDropError(null);
      webCapture.clearError();
    },
  };
}

const droppedTypes: readonly (readonly [RegExp, string])[] = [
  [/\.pdf$/iu, "application/pdf"],
  [/\.epub$/iu, "application/epub+zip"],
  [/\.x?html?$/iu, "text/html"],
];

export function droppedMediaType(file: {
  readonly name: string;
  readonly type: string;
}): string | null {
  if (["application/pdf", "application/epub+zip", "text/html"].includes(file.type)) {
    return file.type;
  }
  return droppedTypes.find(([pattern]) => pattern.test(file.name))?.[1] ?? null;
}
