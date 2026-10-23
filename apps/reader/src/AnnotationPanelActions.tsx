import { t as translate } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { ReaderButton } from "@mdbase-reader/ui";
import { useState, type JSX } from "react";

import { commentRequest } from "./annotation-composer-request.js";
import { annotationEditorKeys, confirmAnnotationDiscard } from "./annotation-draft-actions.js";
import { AnnotationTextArea } from "./AnnotationTextArea.js";
import { readerErrorMessage } from "./errors.js";
import { BookmarkIcon, CloseIcon, CommentIcon } from "./icons.js";

import type { AnnotationComposerController } from "./use-annotation-composer.js";
import type { ReaderSourceWorkspaceController } from "./use-reader-workspace.js";

/**
 * Annotations that need no selection: a comment about the whole source, or a bookmark at the
 * current reading position. Highlights and areas still start from the document.
 */
export function AnnotationPanelActions({
  workspace,
  composer,
}: {
  readonly workspace: ReaderSourceWorkspaceController;
  readonly composer: AnnotationComposerController;
}): JSX.Element {
  const { t } = useLingui();
  const [commenting, setCommenting] = useState(false);
  const source = workspace.sourceRecord.status === "ready" ? workspace.sourceRecord.value : null;
  return (
    <>
      <div className="annotation-panel-actions">
        <button
          type="button"
          aria-expanded={commenting}
          disabled={!source}
          title={t({ message: "Comment on the source as a whole" })}
          onClick={() => setCommenting(true)}
        >
          <CommentIcon />
          <Trans> Comment</Trans>
        </button>
        <button
          type="button"
          disabled={!composer.canBookmark || composer.bookmarking}
          title={
            composer.canBookmark
              ? t({ message: "Bookmark the current reading position" })
              : t({ message: "Open the document to bookmark a position" })
          }
          onClick={composer.bookmark}
        >
          <BookmarkIcon />{" "}
          {composer.bookmarking
            ? t({ message: "Bookmarking…", context: "AnnotationPanelActions interface" })
            : t({ message: "Bookmark", context: "AnnotationPanelActions interface" })}
        </button>
      </div>
      {commenting && source ? (
        <SourceCommentComposer
          key={source.id}
          onSave={(comment) =>
            workspace.createAnnotation(commentRequest(source, comment)).then(() => undefined)
          }
          onClose={() => setCommenting(false)}
        />
      ) : null}
    </>
  );
}

function SourceCommentComposer({
  onSave,
  onClose,
}: {
  readonly onSave: (comment: string) => Promise<void>;
  readonly onClose: () => void;
}): JSX.Element {
  const { t } = useLingui();
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const dismiss = (): void => {
    if (
      saving ||
      (comment.trim() &&
        !confirmAnnotationDiscard(translate({ message: "Discard this unsaved comment?" })))
    ) {
      return;
    }
    onClose();
  };
  const save = (): void => {
    if (saving || !comment.trim()) {
      return;
    }
    setSaving(true);
    setProblem(null);
    onSave(comment).then(onClose, (reason: unknown) => {
      setProblem(
        readerErrorMessage(reason, translate({ message: "Reader could not save this comment." })),
      );
      setSaving(false);
    });
  };
  return (
    // The region delegates keyboard shortcuts from its interactive children.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <section
      className="annotation-composer is-comment"
      aria-labelledby="source-comment-title"
      onKeyDown={(event) => annotationEditorKeys(event, dismiss, save)}
    >
      <header>
        <strong id="source-comment-title">
          <Trans>New comment</Trans>
        </strong>
        <button
          type="button"
          className="icon-button"
          aria-label={t({
            message: "Discard comment",
            context: "AnnotationPanelActions interface",
          })}
          onClick={dismiss}
          disabled={saving}
        >
          <CloseIcon />
        </button>
      </header>
      <AnnotationTextArea
        value={comment}
        readOnly={saving}
        placeholder={t({ message: "A thought about this source as a whole" })}
        onChange={setComment}
      />
      {problem ? <p role="alert">{problem}</p> : null}
      <footer>
        <button type="button" onClick={dismiss} disabled={saving}>
          <Trans context="Reader action">Cancel</Trans>
        </button>
        <ReaderButton disabled={saving || !comment.trim()} onClick={save}>
          {saving
            ? t({ message: "Saving…", context: "AnnotationPanelActions interface" })
            : t({ message: "Save comment", context: "AnnotationPanelActions interface" })}
        </ReaderButton>
      </footer>
    </section>
  );
}
