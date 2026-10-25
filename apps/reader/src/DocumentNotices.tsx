import { HighlightSavedNotice, HighlightSweep } from "./HighlightSavedNotice.js";

import type { AnnotationComposerController } from "./use-annotation-composer.js";
import type { JSX } from "react";

/**
 * Passing notices about the document, stacked at the foot of its pane so none covers the page or
 * another: "Highlight saved · Undo", a failed save or navigation, and Back to reading position.
 * While the composer is open it reports its own problems, and its card takes the foot of a phone.
 */
export function DocumentNotices({
  composer,
}: {
  readonly composer: AnnotationComposerController;
}): JSX.Element {
  const composing = composer.selection !== null;
  return (
    <>
      <HighlightSweep saved={composer.savedHighlight} />
      <div className="document-notices">
        <HighlightSavedNotice
          saved={composer.savedHighlight}
          overlaid={composing || composer.toolbar !== null}
          onUndo={composer.undoSavedHighlight}
          onDismiss={composer.dismissSavedHighlight}
        />
        {!composing && composer.error ? (
          <div className="annotation-compose-error" role="alert">
            {composer.error}
          </div>
        ) : null}
        {!composing && composer.returnToReading ? (
          <button className="annotation-return" type="button" onClick={composer.returnToReading}>
            Back to reading position
          </button>
        ) : null}
      </div>
    </>
  );
}
