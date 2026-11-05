import { lazyFeature } from "./lazy-feature.js";
import { OverlayPresence } from "./OverlayPresence.js";

import type { SourceAdditionController } from "./use-source-addition.js";
import type { JSX } from "react";

const SourceAddDialog = lazyFeature(
  async () => ({ default: (await import("./SourceAddDialog.js")).SourceAddDialog }),
  "the add source dialog",
);
const SourceImportOverlay = lazyFeature(
  async () => ({ default: (await import("./SourceImportDialog.js")).SourceImportOverlay }),
  "the add source dialog",
);

export function SourceAdditionOverlays({
  addition,
  canChooseFile,
}: {
  readonly addition: SourceAdditionController;
  readonly canChooseFile: boolean;
}): JSX.Element {
  return (
    <>
      <OverlayPresence open={addition.dialogOpen}>
        <SourceAddDialog
          open={true}
          busy={addition.adding}
          error={addition.error}
          canChooseFile={canChooseFile}
          onClose={addition.close}
          onChooseFile={addition.chooseFile}
          onCapture={(url) => void addition.capture(url)}
          lookup={addition.lookup}
          onEdit={addition.clearError}
          onDropFile={(file) => void addition.addFile(file)}
        />
      </OverlayPresence>
      <OverlayPresence open={Boolean(addition.fileImport.file)}>
        {addition.fileImport.file ? <SourceImportOverlay flow={addition.fileImport} /> : null}
      </OverlayPresence>
    </>
  );
}
