import { ReaderButton } from "@mdbase-reader/ui";
import { useEffect, useRef, useState } from "react";

import { annotationEditorKeys } from "./annotation-draft-actions.js";
import { AnnotationTextArea } from "./AnnotationTextArea.js";
import { CloseIcon } from "./icons.js";

import type { AnnotationComposerController } from "./use-annotation-composer.js";
import type { JSX } from "react";

export function AnnotationComposer({
  composer,
}: {
  readonly composer: AnnotationComposerController;
}): JSX.Element | null {
  const [expanded, setExpanded] = useState(false);
  const [comment, setComment] = useState(() => ({
    selection: composer.selection,
    body: composer.note,
  }));
  const note = comment.selection === composer.selection ? comment.body : composer.note;
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
      {expanded || note ? (
        <>
          <div className="annotation-composer-label">
            Note <span>optional</span>
          </div>
          <AnnotationTextArea
            value={note}
            readOnly={composer.status === "saving"}
            placeholder="Why does this matter?"
            onChange={(body) => {
              setExpanded(true);
              setComment({ selection: composer.selection, body });
              composer.setNote(body);
            }}
          />
        </>
      ) : (
        <button className="annotation-add-comment" type="button" onClick={() => setExpanded(true)}>
          Add a comment
        </button>
      )}
      {note ? (
        <small className="annotation-draft-status" role="status">
          Not saved yet — keep Reader open until you save this annotation.
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
