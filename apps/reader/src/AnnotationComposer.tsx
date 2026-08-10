import { ReaderButton } from "@mdbase-reader/ui";
import { useEffect, useMemo } from "react";

import { CloseIcon } from "./icons.js";
import { MultilineCodeEditor } from "./MultilineCodeEditor.js";

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
          <CloseIcon />
        </button>
      </header>
      {composer.selection.kind === "text" ? (
        <blockquote>{composer.selection.value.target.quote.exact}</blockquote>
      ) : (
        <AreaPreview image={composer.selection.value.image} />
      )}
      <div className="annotation-composer-label">
        Note <span>optional</span>
      </div>
      <MultilineCodeEditor
        value={composer.note}
        ariaLabel="Annotation note"
        className="annotation-composer-editor"
        placeholder="Why does this matter?"
        onChange={composer.setNote}
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
