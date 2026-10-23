import { msg } from "@lingui/core/macro";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { memo, useMemo, useState } from "react";

import { problemMessage } from "./capture-model.js";
import { displayQuote, highlightComment } from "./highlight-body.js";

import type { ExtensionCaptureController } from "./capture-controller.js";
import type { QuoteOutcome } from "./page-annotations.js";
import type { MessageDescriptor } from "@lingui/core";
import type { Annotation, AnnotationDeletionPlan } from "@mdbase-reader/core";

/** The saved page's highlights: show one on the page, change its comment, or delete it. */
export function SavedHighlights({
  controller: c,
}: {
  readonly controller: ExtensionCaptureController;
}): React.JSX.Element | null {
  const { t } = useLingui();
  const { revealHighlight, updateHighlightComment, planHighlightDeletion, deleteHighlight } = c;
  const actions = useMemo(
    () => ({ revealHighlight, updateHighlightComment, planHighlightDeletion, deleteHighlight }),
    [revealHighlight, updateHighlightComment, planHighlightDeletion, deleteHighlight],
  );
  if (!c.source) {
    return null;
  }
  const highlights = c.annotations.filter((annotation) => annotation.target?.quote);
  const hidden = c.projection ? c.projection.report.total - c.projection.report.shown : 0;
  // A PDF keeps the list, and its Refresh, for highlights made in Reader meanwhile.
  if (!highlights.length && !hidden && c.capture?.kind !== "pdf") {
    return null;
  }
  return (
    <section className="saved-highlights" aria-labelledby="saved-highlights-heading">
      <div className="list-header">
        <h2 id="saved-highlights-heading">
          <Trans>
            Saved highlights {highlights.length ? <span>{highlights.length}</span> : null}
          </Trans>
        </h2>
        <button
          type="button"
          className="text-button"
          disabled={c.busy || c.refreshing}
          onClick={() => void c.refreshHighlights()}
        >
          {c.refreshing ? t`Updating…` : t`Refresh`}
        </button>
      </div>
      {hidden ? (
        <p className="hint">
          <Trans>
            {hidden} not shown on this page, which may have changed since it was saved. They are
            still in the saved copy.
          </Trans>
        </p>
      ) : null}
      <ul>
        {highlights.map((annotation) => (
          <HighlightItem
            key={annotation.id}
            annotation={annotation}
            outcome={c.projection?.outcomes.get(annotation.id) ?? null}
            busy={c.busy}
            navigated={c.navigated}
            actions={actions}
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

const outcomeLabels: Record<Exclude<QuoteOutcome, "shown">, MessageDescriptor> = {
  missing: msg`Not found on this page`,
  ambiguous: msg`Matches several places on this page`,
};

/** The controller's actions an item uses; they keep their identity across renders. */
type HighlightActions = Pick<
  ExtensionCaptureController,
  "revealHighlight" | "updateHighlightComment" | "planHighlightDeletion" | "deleteHighlight"
>;

// Memoised: typing in the panel's drafts must not redraw every saved highlight.
const HighlightItem = memo(function HighlightItem({
  annotation,
  outcome,
  busy,
  navigated,
  actions: c,
}: {
  readonly annotation: Annotation;
  readonly outcome: QuoteOutcome | null;
  readonly busy: boolean;
  readonly navigated: boolean;
  readonly actions: HighlightActions;
}): React.JSX.Element {
  const { t } = useLingui();
  const [mode, setMode] = useState<Mode>({ kind: "view" });
  const [working, setWorking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const comment = highlightComment(annotation.body);
  const locked = working || busy;
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
        disabled={locked || navigated}
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
            {comment ? t`Edit comment` : t`Add comment`}
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
            <Trans>Delete</Trans>
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
});

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
  const { t } = useLingui();
  const { i18n } = useLingui();
  const shown = outcome === "shown";
  return (
    <>
      <button
        type="button"
        className="highlight-quote"
        disabled={disabled || !shown}
        title={shown ? t`Show on the page` : undefined}
        onClick={onReveal}
      >
        <span className="highlight-mark">
          {displayQuote(annotation.target?.quote?.exact ?? "")}
        </span>
      </button>
      {outcome && !shown ? <p className="hint">{i18n._(outcomeLabels[outcome])}</p> : null}
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
  const { t } = useLingui();
  return (
    <form
      className="comment-editor"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(value);
      }}
    >
      <label htmlFor={id} className="visually-hidden">
        <Trans>Comment</Trans>
      </label>
      <textarea
        className="mdbase-field"
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
          {working ? t`Saving…` : t`Save comment`}
        </button>
        <button type="button" className="text-button" onClick={onCancel}>
          <Trans>Cancel</Trans>
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
  const { t } = useLingui();
  const links = plan.brokenLinkPaths.length;
  return (
    <div className="delete-confirm" role="alertdialog" aria-label={t`Delete highlight`}>
      <p>
        <Trans>
          Delete this highlight from your collection?
          {links ? (
            <Plural
              value={links}
              one=" # note links to it; those links will break."
              other=" # notes link to it; those links will break."
            />
          ) : (
            ""
          )}
        </Trans>
      </p>
      <div className="item-actions">
        <button type="button" className="danger" disabled={locked} onClick={onDelete}>
          {working ? t`Deleting…` : t`Delete`}
        </button>
        <button type="button" className="text-button" onClick={onCancel}>
          <Trans>Cancel</Trans>
        </button>
      </div>
    </div>
  );
}
