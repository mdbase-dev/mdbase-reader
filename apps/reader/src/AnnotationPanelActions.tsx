import { ReaderButton } from "@mdbase-reader/ui";
import { useState, type JSX } from "react";

import { commentRequest } from "./annotation-composer-request.js";
import { annotationEditorKeys, confirmAnnotationDiscard } from "./annotation-draft-actions.js";
import { AnnotationOwnerChooser } from "./AnnotationOwnerChooser.js";
import { AnnotationTextArea } from "./AnnotationTextArea.js";
import { readerErrorMessage } from "./errors.js";
import { BookmarkIcon, CloseIcon, CommentIcon } from "./icons.js";
import { useAnnotationOwner, type AnnotationOwnerControl } from "./use-annotation-owner.js";

import type { AnnotationComposerController } from "./use-annotation-composer.js";
import type { ReaderSourceWorkspaceController } from "./use-reader-workspace.js";
import type { ReaderWorkspaceGateway } from "./workspace-model.js";

/**
 * Annotations that need no selection: a comment about the whole source, or a bookmark at the
 * current reading position. Highlights and areas still start from the document.
 */
export function AnnotationPanelActions({
  workspace,
  composer,
  gateway,
}: {
  readonly gateway?: ReaderWorkspaceGateway;
  readonly workspace: ReaderSourceWorkspaceController;
  readonly composer: AnnotationComposerController;
}): JSX.Element {
  const [commenting, setCommenting] = useState(false);
  const source = workspace.sourceRecord.status === "ready" ? workspace.sourceRecord.value : null;
  const ownership = useAnnotationOwner({
    source,
    surface: null,
    selection: null,
    sources: workspace.annotationView?.sources,
    gateway,
    create: workspace.createAnnotation,
  });
  return (
    <>
      <div className="annotation-panel-actions">
        <button
          type="button"
          aria-expanded={commenting}
          disabled={!source}
          title="Comment on the source as a whole"
          onClick={() => setCommenting(true)}
        >
          <CommentIcon /> Comment
        </button>
        <button
          type="button"
          disabled={!composer.canBookmark || composer.bookmarking}
          title={
            composer.canBookmark
              ? "Bookmark the current reading position"
              : "Open the document to bookmark a position"
          }
          onClick={composer.bookmark}
        >
          <BookmarkIcon /> {composer.bookmarking ? "Bookmarking…" : "Bookmark"}
        </button>
      </div>
      {commenting && source ? (
        <SourceCommentComposer
          key={source.id}
          ownerControl={ownership.control}
          onSave={(comment) =>
            ownership.create(commentRequest(source, comment)).then(() => undefined)
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
  ownerControl,
}: {
  readonly ownerControl?: AnnotationOwnerControl | undefined;
  readonly onSave: (comment: string) => Promise<void>;
  readonly onClose: () => void;
}): JSX.Element {
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const dismiss = (): void => {
    if (saving || (comment.trim() && !confirmAnnotationDiscard("Discard this unsaved comment?"))) {
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
      setProblem(readerErrorMessage(reason, "Reader could not save this comment."));
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
        <strong id="source-comment-title">New comment</strong>
        <button
          type="button"
          className="icon-button"
          aria-label="Discard comment"
          onClick={dismiss}
          disabled={saving}
        >
          <CloseIcon />
        </button>
      </header>
      <AnnotationOwnerChooser control={ownerControl} />
      <AnnotationTextArea
        value={comment}
        readOnly={saving}
        placeholder="A thought about this source as a whole"
        onChange={setComment}
      />
      {problem ? <p role="alert">{problem}</p> : null}
      <footer>
        <button type="button" onClick={dismiss} disabled={saving}>
          Cancel
        </button>
        <ReaderButton disabled={saving || !comment.trim()} onClick={save}>
          {saving ? "Saving…" : "Save comment"}
        </ReaderButton>
      </footer>
    </section>
  );
}
