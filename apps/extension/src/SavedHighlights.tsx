import { useState } from "react";

import { problemMessage } from "./capture-model.js";
import { highlightComment } from "./highlight-body.js";

import type { ExtensionCaptureController } from "./capture-controller.js";
import type { QuoteOutcome } from "./page-annotations.js";
import type { Annotation, AnnotationDeletionPlan } from "@mdbase-reader/core";

/** The saved page's highlights: show one on the page, change its comment, or delete it. */
export function SavedHighlights({
  controller: c,
}: {
  readonly controller: ExtensionCaptureController;
}): React.JSX.Element | null {
  if (!c.source) {
    return null;
  }
  const highlights = c.annotations.filter((annotation) => annotation.target?.quote);
  const hidden = c.projection ? c.projection.report.total - c.projection.report.shown : 0;
  return (
    <section className="saved-highlights" aria-labelledby="saved-highlights-heading">
      <div className="list-header">
        <h2 id="saved-highlights-heading">
          Saved highlights {highlights.length ? <span>{highlights.length}</span> : null}
        </h2>
        <button
          type="button"
          className="text-button"
          disabled={c.busy || c.refreshing}
          onClick={() => void c.refreshHighlights()}
        >
          {c.refreshing ? "Updating…" : "Refresh"}
        </button>
      </div>
      {highlights.length ? null : (
        <p className="hint">
          {c.capture?.kind === "pdf" ? "Highlights made in Reader appear here." : "None yet."}
        </p>
      )}
      {hidden ? (
        <p className="hint">
          {hidden} not shown on this page, which may have changed since it was saved. They are still
          in the saved copy.
        </p>
      ) : null}
      <ul>
        {highlights.map((annotation) => (
          <HighlightItem
            key={annotation.id}
            annotation={annotation}
            outcome={c.projection?.outcomes.get(annotation.id) ?? null}
            controller={c}
          />
        ))}
      </ul>
    </section>
  );
}

type Mode =
  | { readonly kind: "view" }
  | { readonly kind: "edit"; readonly comment: string }
  | { readonly kind: "delete"; readonly plan: AnnotationDeletionPlan };

const outcomeLabels: Record<Exclude<QuoteOutcome, "shown">, string> = {
  missing: "Not found on this page",
  ambiguous: "Matches several places on this page",
};

function HighlightItem({
  annotation,
  outcome,
  controller: c,
}: {
  readonly annotation: Annotation;
  readonly outcome: QuoteOutcome | null;
  readonly controller: ExtensionCaptureController;
}): React.JSX.Element {
  const [mode, setMode] = useState<Mode>({ kind: "view" });
  const [working, setWorking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const comment = highlightComment(annotation.body);
  const locked = working || c.busy;
  const act = (action: () => Promise<void>): void => {
    setWorking(true);
    setProblem(null);
    action()
      .catch((reason: unknown) => setProblem(problemMessage(reason)))
      .finally(() => setWorking(false));
  };
  const view = (): void => setMode({ kind: "view" });
  const showComment = mode.kind !== "edit" && comment;
  const showTags = mode.kind !== "edit" && annotation.tags.length > 0;
  return (
    <li className={`saved-highlight swatch-${annotation.color ?? "yellow"}`}>
      <QuoteButton
        annotation={annotation}
        outcome={outcome}
        disabled={locked || c.navigated}
        onReveal={() => void c.revealHighlight(annotation.id)}
      />
      {mode.kind === "edit" ? (
        <CommentEditor
          id={`comment-${annotation.id}`}
          value={mode.comment}
          working={working}
          locked={locked}
          onChange={(value) => setMode({ kind: "edit", comment: value })}
          onCancel={view}
          onSave={(value) =>
            act(async () => {
              await c.updateHighlightComment(annotation, value);
              view();
            })
          }
        />
      ) : null}
      {showComment ? <p className="highlight-comment">{comment}</p> : null}
      {showTags ? <p className="highlight-tags">{annotation.tags.join(", ")}</p> : null}
      {mode.kind === "delete" ? (
        <DeleteConfirm
          plan={mode.plan}
          working={working}
          locked={locked}
          onCancel={view}
          onDelete={() => act(() => c.deleteHighlight(annotation, mode.plan))}
        />
      ) : null}
      {mode.kind === "view" ? (
        <div className="item-actions">
          <button
            type="button"
            className="text-button"
            disabled={locked}
            onClick={() => setMode({ kind: "edit", comment })}
          >
            {comment ? "Edit comment" : "Add comment"}
          </button>
          <button
            type="button"
            className="text-button"
            disabled={locked}
            onClick={() =>
              act(async () =>
                setMode({ kind: "delete", plan: await c.planHighlightDeletion(annotation) }),
              )
            }
          >
            Delete
          </button>
        </div>
      ) : null}
      {problem ? (
        <p className="item-problem" role="alert">
          {problem}
        </p>
      ) : null}
    </li>
  );
}

/** The passage; pressing it scrolls the page there, when the page could show it. */
function QuoteButton({
  annotation,
  outcome,
  disabled,
  onReveal,
}: {
  readonly annotation: Annotation;
  readonly outcome: QuoteOutcome | null;
  readonly disabled: boolean;
  readonly onReveal: () => void;
}): React.JSX.Element {
  const shown = outcome === "shown";
  return (
    <>
      <button
        type="button"
        className="highlight-quote"
        disabled={disabled || !shown}
        title={shown ? "Show on the page" : undefined}
        onClick={onReveal}
      >
        {annotation.target?.quote?.exact}
      </button>
      {outcome && !shown ? <p className="hint">{outcomeLabels[outcome]}</p> : null}
    </>
  );
}

function CommentEditor({
  id,
  value,
  working,
  locked,
  onChange,
  onCancel,
  onSave,
}: {
  readonly id: string;
  readonly value: string;
  readonly working: boolean;
  readonly locked: boolean;
  readonly onChange: (value: string) => void;
  readonly onCancel: () => void;
  readonly onSave: (value: string) => void;
}): React.JSX.Element {
  return (
    <form
      className="comment-editor"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(value);
      }}
    >
      <label htmlFor={id} className="visually-hidden">
        Comment
      </label>
      <textarea
        id={id}
        // eslint-disable-next-line jsx-a11y/no-autofocus -- opened by the reader's own click
        autoFocus
        rows={3}
        value={value}
        disabled={locked}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            onSave(value);
          }
        }}
      />
      <div className="item-actions">
        <button type="submit" className="secondary" disabled={locked}>
          {working ? "Saving…" : "Save comment"}
        </button>
        <button type="button" className="text-button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function DeleteConfirm({
  plan,
  working,
  locked,
  onCancel,
  onDelete,
}: {
  readonly plan: AnnotationDeletionPlan;
  readonly working: boolean;
  readonly locked: boolean;
  readonly onCancel: () => void;
  readonly onDelete: () => void;
}): React.JSX.Element {
  const links = plan.brokenLinkPaths.length;
  return (
    <div className="delete-confirm" role="alertdialog" aria-label="Delete highlight">
      <p>
        Delete this highlight from your collection?
        {links
          ? ` ${String(links)} ${links === 1 ? "note links" : "notes link"} to it; those links will break.`
          : ""}
      </p>
      <div className="item-actions">
        <button type="button" className="danger" disabled={locked} onClick={onDelete}>
          {working ? "Deleting…" : "Delete"}
        </button>
        <button type="button" className="text-button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
