import { lazy, Suspense, useState, type JSX } from "react";

import { AnnotationComposer } from "./AnnotationComposer.js";
import { CitationEditor } from "./CitationEditor.js";
import { CitationIcon, HighlightIcon, MoreIcon, NoteIcon } from "./icons.js";

import type { AnnotationComposerController } from "./use-annotation-composer.js";
import type { AsyncResource, ReaderWorkspaceController } from "./use-reader-workspace.js";
import type { Annotation } from "@mdbase-reader/core";

export type InspectorTab = "note" | "annotations" | "citation";

export interface InspectorPaneProps {
  readonly open: boolean;
  readonly tab: InspectorTab;
  readonly workspace: ReaderWorkspaceController;
  readonly composer: AnnotationComposerController;
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
  composer,
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
        <button
          type="button"
          role="tab"
          aria-selected={tab === "citation"}
          onClick={() => onTabChange("citation")}
        >
          <CitationIcon />
          Citation
        </button>
      </div>
      {tab === "annotations" ? (
        <div className="annotation-workspace">
          <AnnotationComposer composer={composer} />
          <AnnotationList annotations={workspace.annotations} onOpen={composer.open} />
        </div>
      ) : tab === "note" ? (
        <div className="note-editor">
          <SourceNoteEditor workspace={workspace} />
        </div>
      ) : (
        <CitationEditor workspace={workspace} />
      )}
    </aside>
  );
}

function AnnotationList({
  annotations,
  onOpen,
}: {
  readonly annotations: AsyncResource<readonly Annotation[]>;
  readonly onOpen: (annotation: Annotation) => void;
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
  if (annotations.value.length === 0) {
    return (
      <div className="inspector-status annotation-empty">
        <strong>No annotations yet</strong>
        <span>Select text or an area in the document to begin.</span>
      </div>
    );
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
            {annotation.locator ? <small>{annotation.locator.label}</small> : null}
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
            <button
              className="icon-button"
              type="button"
              aria-label="Open annotation in document"
              onClick={() => onOpen(annotation)}
            >
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
  const [citationInsertion, setCitationInsertion] = useState(0);
  const sourceRecord = workspace.sourceRecord;
  if (sourceRecord.status !== "ready") {
    return sourceRecord.status === "error" ? (
      <div className="inspector-status is-error" role="alert">
        {sourceRecord.message}
      </div>
    ) : (
      <div className="editor-loading">Opening source note…</div>
    );
  }
  const citekey = sourceRecord.value.citation?.id;
  return (
    <>
      <div className="source-note-toolbar">
        <span>Markdown</span>
        <button
          type="button"
          disabled={!citekey}
          title={citekey ? `Insert [@${citekey}] at the cursor` : "Add citation metadata first"}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => setCitationInsertion((value) => value + 1)}
        >
          <CitationIcon />
          {citekey ? `Insert [@${citekey}]` : "Citation required"}
        </button>
      </div>
      <Suspense fallback={<div className="editor-loading">Opening source note…</div>}>
        <MarkdownEditor
          className="source-note-editor-surface"
          value={workspace.draft}
          ariaLabel="Source literature note"
          onChange={workspace.setDraft}
          onBlur={workspace.saveDraft}
          insertion={
            citekey && citationInsertion > 0
              ? {
                  requestId: citationInsertion,
                  text: `[@${citekey}]`,
                  wordBounded: true,
                }
              : null
          }
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
