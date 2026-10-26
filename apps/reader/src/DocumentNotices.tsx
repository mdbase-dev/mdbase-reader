import { Trans } from "@lingui/react/macro";

import { HighlightSavedNotice, HighlightSweep } from "./HighlightSavedNotice.js";

import type { AnnotationComposerController } from "./use-annotation-composer.js";
import type { JSX, ReactNode } from "react";

/**
 * Passing notices about the document, stacked at the foot of its pane so none covers the page or
 * another: "Highlight saved · Undo", a failed save or navigation, Back to reading position, and
 * (as children, nearest the foot) the chapter hint. While the composer is open it reports its own
 * problems, and its card takes the foot of a phone. Only the focused document has a composer.
 */
export function DocumentNotices({
  composer,
  children,
}: {
  readonly composer: AnnotationComposerController | null;
  readonly children?: ReactNode;
}): JSX.Element {
  return (
    <>
      {composer ? <HighlightSweep saved={composer.savedHighlight} /> : null}
      <div className="document-notices">
        {composer ? <ComposerNotices composer={composer} /> : null}
        {children}
      </div>
    </>
  );
}

function ComposerNotices({
  composer,
}: {
  readonly composer: AnnotationComposerController;
}): JSX.Element {
  const composing = composer.selection !== null;
  return (
    <>
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
          <Trans>Back to reading position</Trans>
        </button>
      ) : null}
    </>
  );
}
