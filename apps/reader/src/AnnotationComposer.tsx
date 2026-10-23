import { Trans, useLingui } from "@lingui/react/macro";
import { ReaderButton } from "@mdbase-reader/ui";
import { useEffect, useRef, useState } from "react";

import { annotationEditorKeys } from "./annotation-draft-actions.js";
import { AnnotationTextArea } from "./AnnotationTextArea.js";
import { CloseIcon } from "./icons.js";

import type { AnnotationComposerController } from "./use-annotation-composer.js";
import type { CSSProperties, JSX } from "react";

export function AnnotationComposer({
  composer,
  style,
}: {
  readonly composer: AnnotationComposerController;
  readonly style?: CSSProperties;
}): JSX.Element | null {
  const { t } = useLingui();
  const [expanded, setExpanded] = useState(false);
  const [comment, setComment] = useState(() => ({
    selection: composer.selection,
    body: composer.note,
  }));
  const note = comment.selection === composer.selection ? comment.body : composer.note;
  if (!composer.selection) {
    return <AnnotationComposerNotices composer={composer} />;
  }
  // Text reaches the composer only when the reader chose to comment; an area may be saved bare.
  const commenting = composer.selection.kind === "text" || expanded || note !== "";
  return (
    // The region delegates keyboard shortcuts from its interactive children.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <section
      className={`annotation-composer is-${composer.selection.kind === "area" ? "area" : "highlight"}`}
      style={style}
      aria-labelledby="annotation-composer-title"
      onKeyDown={(event) => annotationEditorKeys(event, composer.dismiss, composer.save)}
    >
      <header>
        <strong id="annotation-composer-title">
          {composer.selection.kind === "area"
            ? t({ message: "New area annotation" })
            : t({ message: "Comment on highlight" })}
        </strong>
        <button
          type="button"
          className="icon-button"
          aria-label={t({ message: "Discard selection", context: "AnnotationComposer interface" })}
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
      {commenting ? (
        <AnnotationTextArea
          value={note}
          readOnly={composer.status === "saving"}
          placeholder={t({ message: "Why does this matter?" })}
          rows={3}
          autoSize
          onChange={(body) => {
            setExpanded(true);
            setComment({ selection: composer.selection, body });
            composer.setNote(body);
          }}
        />
      ) : null}
      {note ? (
        <small className="annotation-draft-status" role="status">
          <Trans>Not saved yet — keep Reader open until you save this annotation.</Trans>
        </small>
      ) : null}
      {composer.newSelection ? (
        <p className="annotation-new-selection" role="status">
          <Trans>You selected other text.</Trans>{" "}
          <button type="button" onClick={composer.useNewSelection}>
            <Trans>Use it for this comment</Trans>
          </button>
        </p>
      ) : null}
      {composer.error ? <p role="alert">{composer.error}</p> : null}
      <footer>
        {commenting ? null : (
          <button
            className="annotation-add-comment"
            type="button"
            onClick={() => setExpanded(true)}
          >
            <Trans>Add a comment</Trans>
          </button>
        )}
        <ReaderButton disabled={composer.status === "saving"} onClick={composer.save}>
          {composer.status === "saving"
            ? t({ message: "Saving…", context: "AnnotationComposer interface" })
            : composer.selection.kind === "area"
              ? t({ message: "Save area", context: "AnnotationComposer interface" })
              : t({ message: "Save highlight", context: "AnnotationComposer interface" })}
        </ReaderButton>
      </footer>
    </section>
  );
}

function AreaPreview({ image }: { readonly image: Blob }): JSX.Element {
  const { t } = useLingui();
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
      <img ref={preview} alt={t({ message: "Selected PDF area" })} />
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
          <Trans>Resume unfinished annotation</Trans>
        </button>
      ) : null}
      {composer.returnToReading ? (
        <button className="annotation-return" type="button" onClick={composer.returnToReading}>
          <Trans>Back to reading position</Trans>
        </button>
      ) : null}
    </>
  );
}
