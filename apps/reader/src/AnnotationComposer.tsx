import { ReaderButton } from "@mdbase-reader/ui";

import type { AnnotationComposerController } from "./use-annotation-composer.js";
import type { JSX } from "react";

export function AnnotationComposer({
  composer,
}: {
  readonly composer: AnnotationComposerController;
}): JSX.Element | null {
  if (!composer.selection) {
    return composer.error ? (
      <div className="annotation-compose-error" role="alert">
        {composer.error}
      </div>
    ) : null;
  }
  return (
    <section className="annotation-composer" aria-labelledby="annotation-composer-title">
      <header>
        <div>
          <span className="mono">New highlight</span>
          <strong id="annotation-composer-title">Save this passage</strong>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Discard selection"
          onClick={composer.dismiss}
        >
          ×
        </button>
      </header>
      <blockquote>{composer.selection.target.quote.exact}</blockquote>
      <label htmlFor="reader-annotation-note">
        Note <span>optional</span>
      </label>
      <textarea
        id="reader-annotation-note"
        value={composer.note}
        rows={3}
        placeholder="Why does this matter?"
        onChange={(event) => composer.setNote(event.target.value)}
      />
      {composer.error ? <p role="alert">{composer.error}</p> : null}
      <footer>
        <button type="button" onClick={composer.dismiss}>
          Cancel
        </button>
        <ReaderButton disabled={composer.status === "saving"} onClick={composer.save}>
          {composer.status === "saving" ? "Saving…" : "Save highlight"}
        </ReaderButton>
      </footer>
    </section>
  );
}
