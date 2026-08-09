import { ReaderButton } from "@mdbase-reader/ui";
import { useEffect, useMemo } from "react";

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
          <span className="mono">
            {composer.selection.kind === "area" ? "New area annotation" : "New highlight"}
          </span>
          <strong id="annotation-composer-title">
            {composer.selection.kind === "area" ? "Save this area" : "Save this passage"}
          </strong>
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
      {composer.selection.kind === "text" ? (
        <blockquote>{composer.selection.value.target.quote.exact}</blockquote>
      ) : (
        <AreaPreview image={composer.selection.value.image} />
      )}
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
          {composer.status === "saving"
            ? "Saving…"
            : composer.selection.kind === "area"
              ? "Save area"
              : "Save highlight"}
        </ReaderButton>
      </footer>
    </section>
  );
}

function AreaPreview({ image }: { readonly image: Blob }): JSX.Element {
  const url = useMemo(() => URL.createObjectURL(image), [image]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return (
    <div className="annotation-area-preview">
      <img src={url} alt="Selected PDF area" />
    </div>
  );
}
