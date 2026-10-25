import { ReaderButton } from "@mdbase-reader/ui";
import { useEffect, useRef, useState, type JSX, type MouseEvent } from "react";

import { commentRequest } from "./annotation-composer-request.js";
import { annotationEditorKeys, confirmAnnotationDiscard } from "./annotation-draft-actions.js";
import { isAnnotationSaveCancelled } from "./annotation-ownership.js";
import { AnnotationOwnerChooser } from "./AnnotationOwnerChooser.js";
import { AnnotationTextArea } from "./AnnotationTextArea.js";
import { readerErrorMessage } from "./errors.js";
import { BookmarkIcon, CloseIcon, CommentIcon, PlusIcon } from "./icons.js";
import { Menu } from "./Menu.js";
import { useAnnotationOwner, type AnnotationOwnerControl } from "./use-annotation-owner.js";

import type { AnnotationComposerController } from "./use-annotation-composer.js";
import type { ReaderSourceWorkspaceController } from "./use-reader-workspace.js";
import type { ReaderWorkspaceGateway } from "./workspace-model.js";

/**
 * Annotations that need no selection: a comment about the whole source, or a bookmark at the
 * current reading position. Highlights and areas still start from the document. The Add menu
 * ends the Notes panel's control row; the comment composer opens below it.
 */
export function useAnnotationPanelActions({
  workspace,
  composer,
  gateway,
}: {
  readonly gateway?: ReaderWorkspaceGateway | undefined;
  readonly workspace: ReaderSourceWorkspaceController;
  readonly composer: AnnotationComposerController;
}): { readonly addMenu: JSX.Element; readonly composerPanel: JSX.Element | null } {
  const [commenting, setCommenting] = useState(false);
  // Choosing an item closes the menu and hides the focused button; focus then returns here.
  const trigger = useRef<HTMLElement | null>(null);
  const rememberTrigger = (event: MouseEvent<HTMLElement>): void => {
    trigger.current = event.currentTarget.closest("details")?.querySelector("summary") ?? null;
  };
  const source = workspace.sourceRecord.status === "ready" ? workspace.sourceRecord.value : null;
  const ownership = useAnnotationOwner({
    source,
    surface: null,
    selection: null,
    sources: workspace.annotationView?.sources,
    gateway,
    create: workspace.createAnnotation,
  });
  return {
    addMenu: (
      <Menu
        className="annotation-add-menu"
        label="Add source comment or bookmark"
        trigger={<PlusIcon />}
      >
        <button
          type="button"
          disabled={!source}
          onClick={(event) => {
            rememberTrigger(event);
            setCommenting(true);
          }}
        >
          <CommentIcon /> Add source comment
        </button>
        <button
          type="button"
          disabled={!composer.canBookmark || composer.bookmarking}
          title={
            composer.canBookmark
              ? "Bookmark the current reading position"
              : "Open the document to bookmark a position"
          }
          onClick={(event) => {
            rememberTrigger(event);
            composer.bookmark();
            trigger.current?.focus();
          }}
        >
          <BookmarkIcon /> {composer.bookmarking ? "Bookmarking…" : "Bookmark"}
        </button>
      </Menu>
    ),
    composerPanel:
      commenting && source ? (
        <SourceCommentComposer
          key={source.id}
          ownerControl={ownership.control}
          onSave={(comment) =>
            ownership.create(commentRequest(source, comment)).then(() => undefined)
          }
          onClose={() => {
            setCommenting(false);
            trigger.current?.focus();
          }}
        />
      ) : null,
  };
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
  const region = useRef<HTMLElement>(null);
  useEffect(() => {
    // The menu that opened this closes in the same click; focus the comment once that settles.
    const frame = requestAnimationFrame(() => {
      if (!region.current?.contains(document.activeElement)) {
        region.current?.querySelector("textarea")?.focus({ preventScroll: true });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  const dismiss = async (): Promise<void> => {
    if (
      saving ||
      (comment.trim() && !(await confirmAnnotationDiscard("Discard this unsaved comment?")))
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
      if (!isAnnotationSaveCancelled(reason)) {
        setProblem(readerErrorMessage(reason, "Reader could not save this source comment."));
      }
      setSaving(false);
    });
  };
  return (
    // The region delegates keyboard shortcuts from its interactive children.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <section
      ref={region}
      className="annotation-composer is-comment"
      aria-labelledby="source-comment-title"
      onKeyDown={(event) => annotationEditorKeys(event, () => void dismiss(), save)}
    >
      <header>
        <strong id="source-comment-title">New source comment</strong>
        <button
          type="button"
          className="icon-button"
          aria-label="Discard source comment"
          onClick={() => void dismiss()}
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
        <button type="button" onClick={() => void dismiss()} disabled={saving}>
          Cancel
        </button>
        <ReaderButton disabled={saving || !comment.trim()} onClick={save}>
          {saving ? "Saving…" : "Save source comment"}
        </ReaderButton>
      </footer>
    </section>
  );
}
