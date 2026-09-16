import { ReaderButton } from "@mdbase-reader/ui";
import { useEffect, useRef, useState } from "react";

import { annotationEditorKeys } from "./annotation-draft-actions.js";
import { CloseIcon } from "./icons.js";
import { MultilineCodeEditor } from "./MultilineCodeEditor.js";

import type { AnnotationComposerController } from "./use-annotation-composer.js";
import type { JSX } from "react";

export function AnnotationComposer({
  composer,
}: {
  readonly composer: AnnotationComposerController;
}): JSX.Element | null {
  const [expanded, setExpanded] = useState(false);
  if (!composer.selection) {
    return <AnnotationComposerNotices composer={composer} />;
  }
  return (
    // The region delegates keyboard shortcuts from its interactive children.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <section
      className={`annotation-composer is-${composer.selection.kind === "area" ? "area" : "highlight"}`}
      aria-labelledby="annotation-composer-title"
      onKeyDown={(event) => annotationEditorKeys(event, composer.dismiss, composer.save)}
    >
      <header>
        <strong id="annotation-composer-title">
          {composer.selection.kind === "area" ? "New area annotation" : "New highlight"}
        </strong>
        <button
          type="button"
          className="icon-button"
          aria-label="Discard selection"
          onClick={composer.dismiss}
          disabled={composer.status === "saving"}
        >
          <CloseIcon />
        </button>
      </header>
      {composer.selection.kind === "text" ? (
        <blockquote>{composer.selection.value.target.quote.exact}</blockquote>
      ) : (
        <AreaPreview image={composer.selection.value.image} />
      )}
      {expanded || composer.note ? (
        <>
          <div className="annotation-composer-label">
            Note <span>optional</span>
          </div>
          <MultilineCodeEditor
            value={composer.note}
            readOnly={composer.status === "saving"}
            ariaLabel="Annotation note"
            className="annotation-composer-editor"
            placeholder="Why does this matter?"
            onChange={composer.setNote}
            onSave={composer.save}
            focusOnMount
          />
        </>
      ) : (
        <button className="annotation-add-comment" type="button" onClick={() => setExpanded(true)}>
          Add a comment
        </button>
      )}
      {composer.note ? (
        <small className="annotation-draft-status" role="status">
          {composer.draftSaved
            ? "Draft saved on this device"
            : composer.error
              ? "Draft is only in this window"
              : "Saving draft…"}
        </small>
      ) : null}
      {composer.error ? <p role="alert">{composer.error}</p> : null}
      <footer>
        <button type="button" onClick={composer.dismiss} disabled={composer.status === "saving"}>
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
  const preview = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const url = URL.createObjectURL(image);
    const element = preview.current;
    if (element) {
      element.src = url;
    }
    return () => {
      element?.removeAttribute("src");
      URL.revokeObjectURL(url);
    };
  }, [image]);
  return (
    <div className="annotation-area-preview">
      <img ref={preview} alt="Selected PDF area" />
    </div>
  );
}

function AnnotationComposerNotices({
  composer,
}: {
  readonly composer: AnnotationComposerController;
}): JSX.Element {
  return (
    <>
      {composer.error ? (
        <div className="annotation-compose-error" role="alert">
          {composer.error}
        </div>
      ) : null}
      {composer.resumeDraft ? (
        <button className="annotation-return" type="button" onClick={composer.resumeDraft}>
          Resume unfinished annotation
        </button>
      ) : null}
      {composer.returnToReading ? (
        <button className="annotation-return" type="button" onClick={composer.returnToReading}>
          Back to reading position
        </button>
      ) : null}
    </>
  );
}
