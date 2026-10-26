import { Trans } from "@lingui/react/macro";

import type { CitationEditorController } from "./use-citation-editor.js";
import type { JSX } from "react";

export function CitationSaveConflict({
  editor,
}: {
  readonly editor: CitationEditorController;
}): JSX.Element {
  return (
    <div className="citation-feedback citation-conflict" role="alert">
      <strong>
        <Trans>This citation changed elsewhere.</Trans>
      </strong>
      <span>
        <Trans>
          Your draft is still here. Use their version to reload their citation and field evidence.
          Keep mine replaces both with your draft, including any removed fields.
        </Trans>
      </span>
      <div className="citation-review-actions">
        <button
          type="button"
          disabled={editor.status === "saving"}
          onClick={editor.useTheirVersion}
        >
          <Trans>Use their version</Trans>
        </button>
        <button
          type="button"
          disabled={editor.status === "saving" || !editor.assessment.valid}
          onClick={editor.keepMine}
        >
          <Trans>Keep mine</Trans>
        </button>
      </div>
      {editor.error ? <span className="is-error">{editor.error}</span> : null}
    </div>
  );
}
