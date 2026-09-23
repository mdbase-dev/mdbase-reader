import { SourceAddDialog } from "./SourceAddDialog.js";
import { SourceImportOverlay } from "./SourceImportDialog.js";

import type { SourceAdditionController } from "./use-source-addition.js";
import type { JSX } from "react";

export function SourceAdditionOverlays({
  addition,
  canChooseFile,
}: {
  readonly addition: SourceAdditionController;
  readonly canChooseFile: boolean;
}): JSX.Element {
  return (
    <>
      <SourceAddDialog
        open={addition.dialogOpen}
        busy={addition.adding}
        error={addition.error}
        canChooseFile={canChooseFile}
        onClose={addition.close}
        onChooseFile={addition.chooseFile}
        onCapture={(url) => void addition.capture(url)}
        onEdit={addition.clearError}
        onDropFile={(file) => void addition.addFile(file)}
      />
      <SourceImportOverlay flow={addition.fileImport} />
    </>
  );
}
