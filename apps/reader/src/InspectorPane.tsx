import { lazy, Suspense, type JSX } from "react";

import { HighlightIcon, MoreIcon, NoteIcon } from "./icons.js";

import type { AsyncResource, ReaderWorkspaceController } from "./use-reader-workspace.js";
import type { Annotation } from "@mdbase-reader/core";

export type InspectorTab = "note" | "annotations";

export interface InspectorPaneProps {
  readonly open: boolean;
  readonly tab: InspectorTab;
  readonly workspace: ReaderWorkspaceController;
  readonly onClose: () => void;
  readonly onTabChange: (tab: InspectorTab) => void;
}

const MarkdownEditor = lazy(async () => {
  const module = await import("@mdbase-reader/markdown-editor");
  return { default: module.MarkdownEditor };
});

export function InspectorPane({
  open,
  tab,
  workspace,
  onClose,
  onTabChange,
}: InspectorPaneProps): JSX.Element {
  return (
    <aside
      className={open ? "inspector-pane" : "inspector-pane is-mobile-closed"}
      aria-label="Source workspace"
    >
      <button
        className="inspector-close icon-button"
        type="button"
        aria-label="Close source workspace"
        onClick={onClose}
      >
        ×
      </button>
      <div className="inspector-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "annotations"}
          onClick={() => onTabChange("annotations")}
        >
          <HighlightIcon />
          Annotations{" "}
          <span>
            {workspace.annotations.status === "ready" ? workspace.annotations.value.length : "—"}
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "note"}
          onClick={() => onTabChange("note")}
        >
          <NoteIcon />
          Source note
        </button>
      </div>
      {tab === "annotations" ? (
        <AnnotationList annotations={workspace.annotations} />
      ) : (
        <div className="note-editor">
          <SourceNoteEditor workspace={workspace} />
        </div>
      )}
    </aside>
  );
}

function AnnotationList({
  annotations,
}: {
  readonly annotations: AsyncResource<readonly Annotation[]>;
}): JSX.Element {
  if (annotations.status !== "ready") {
    if (annotations.status === "error") {
      return (
        <div className="inspector-status is-error" role="alert">
          {annotations.message}
        </div>
      );
    }
    return <div className="inspector-status">Loading annotations…</div>;
  }
  return (
    <div className="annotation-list">
      <div className="annotation-list-heading">
        <span>On this source</span>
        <button type="button">Newest</button>
      </div>
      {annotations.value.map((annotation) => (
        <article key={annotation.id} className="annotation-card">
          <header>
            <span className={`annotation-kind is-${annotation.annotationType}`}>
              {annotation.annotationType}
            </span>
            <small>{annotation.locator?.label ?? "Page 42"}</small>
          </header>
          {annotation.target?.quote?.exact ? (
            <blockquote>{annotation.target.quote.exact}</blockquote>
          ) : null}
          {annotation.body ? <p>{annotation.body.replace(/^>.*$/gmu, "").trim()}</p> : null}
          <footer>
            <time>
              {new Date(annotation.createdAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </time>
            <button className="icon-button" type="button" aria-label="Annotation actions">
              <MoreIcon />
            </button>
          </footer>
        </article>
      ))}
    </div>
  );
}

function SourceNoteEditor({
  workspace,
}: {
  readonly workspace: ReaderWorkspaceController;
}): JSX.Element {
  if (workspace.sourceRecord.status === "idle" || workspace.sourceRecord.status === "loading") {
    return <div className="editor-loading">Opening source note…</div>;
  }
  if (workspace.sourceRecord.status === "error") {
    return (
      <div className="inspector-status is-error" role="alert">
        {workspace.sourceRecord.message}
      </div>
    );
  }
  return (
    <>
      <Suspense fallback={<div className="editor-loading">Opening source note…</div>}>
        <MarkdownEditor
          value={workspace.draft}
          ariaLabel="Source literature note"
          onChange={workspace.setDraft}
          onBlur={workspace.saveDraft}
        />
      </Suspense>
      {workspace.saveStatus === "saving" ? (
        <span className="editor-save-status" role="status">
          Saving…
        </span>
      ) : null}
      {workspace.saveError ? (
        <span className="editor-save-status is-error" role="alert">
          {workspace.saveError}
        </span>
      ) : null}
    </>
  );
}
