import type { CitationEditorController } from "./use-citation-editor.js";
import type { JSX } from "react";

export function CitationSaveConflict({
  editor,
}: {
  readonly editor: CitationEditorController;
}): JSX.Element {
  return (
    <div className="citation-feedback citation-conflict" role="alert">
      <strong>This citation changed elsewhere.</strong>
      <span>
        Your draft is still here. Use their version to reload their citation and field evidence.
        Keep mine replaces both with your draft, including any removed fields.
      </span>
      <div className="citation-review-actions">
        <button
          type="button"
          disabled={editor.status === "saving"}
          onClick={editor.useTheirVersion}
        >
          Use their version
        </button>
        <button
          type="button"
          disabled={editor.status === "saving" || !editor.assessment.valid}
          onClick={editor.keepMine}
        >
          Keep mine
        </button>
      </div>
      {editor.error ? <span className="is-error">{editor.error}</span> : null}
    </div>
  );
}
