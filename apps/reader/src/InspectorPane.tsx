import { lazy, Suspense, useMemo, useState, type JSX } from "react";

import { annotationWikiCandidate, annotationWikiPath } from "./annotation-wiki-candidates.js";
import { AnnotationComposer } from "./AnnotationComposer.js";
import { AnnotationList } from "./AnnotationList.js";
import { CitationEditor } from "./CitationEditor.js";
import { CitationIcon, CloseIcon, HighlightIcon, NoteIcon, PanelIcon } from "./icons.js";

import type { AnnotationComposerController } from "./use-annotation-composer.js";
import type { ReaderSourceWorkspaceController } from "./use-reader-workspace.js";
import type { SourceSummary } from "@mdbase-reader/core";
import type { TextInsertionRequest } from "@mdbase-reader/markdown-editor";

export type InspectorTab = "note" | "annotations" | "citation";

export interface InspectorPaneProps {
  readonly open: boolean;
  readonly tab: InspectorTab;
  readonly source: SourceSummary | null;
  readonly paneLabel: string;
  readonly workspace: ReaderSourceWorkspaceController;
  readonly composer: AnnotationComposerController;
  readonly onClose: () => void;
  readonly onTabChange: (tab: InspectorTab) => void;
  readonly onPromote: (tab: InspectorTab) => void;
}

const MarkdownEditor = lazy(async () => {
  const module = await import("@mdbase-reader/markdown-editor");
  return { default: module.MarkdownEditor };
});

export function InspectorPane({
  open,
  tab,
  source,
  paneLabel,
  workspace,
  composer,
  onClose,
  onTabChange,
  onPromote,
}: InspectorPaneProps): JSX.Element {
  return (
    <aside
      id="reader-source-tools"
      className={open ? "inspector-pane" : "inspector-pane is-mobile-closed"}
      aria-label="Source workspace"
    >
      <header className="inspector-context">
        <div>
          <span>Follows {paneLabel}</span>
          <strong title={source?.title}>{source?.title ?? "No source in this pane"}</strong>
        </div>
        <button
          type="button"
          className="icon-button inspector-promote"
          disabled={!source}
          aria-label={`Open ${tab} in workbench`}
          title="Keep open as a workbench tab"
          onClick={() => onPromote(tab)}
        >
          <PanelIcon />
          <span>Keep open</span>
        </button>
        <button
          className="inspector-close icon-button"
          type="button"
          aria-label="Close source tools"
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </header>
      <div className="inspector-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          disabled={!source}
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
          disabled={!source}
          aria-selected={tab === "note"}
          onClick={() => onTabChange("note")}
        >
          <NoteIcon />
          Source note
        </button>
        <button
          type="button"
          role="tab"
          disabled={!source}
          aria-selected={tab === "citation"}
          onClick={() => onTabChange("citation")}
        >
          <CitationIcon />
          Citation
        </button>
      </div>
      {source ? (
        <InspectorContent tab={tab} workspace={workspace} composer={composer} />
      ) : (
        <div className="inspector-status inspector-context-empty">
          <strong>Source tools follow the active pane</strong>
          <span>Focus a document, note, annotation, or citation tab to inspect its source.</span>
        </div>
      )}
    </aside>
  );
}

export function InspectorContent({
  tab,
  workspace,
  composer,
}: Pick<InspectorPaneProps, "tab" | "workspace" | "composer">): JSX.Element {
  return tab === "annotations" ? (
    <div className="annotation-workspace">
      <AnnotationComposer composer={composer} />
      <AnnotationList
        annotations={workspace.annotations}
        transclusion={workspace.transclusion}
        onUpdate={workspace.updateAnnotation}
        onPlanDelete={workspace.planAnnotationDeletion}
        onDelete={workspace.deleteAnnotation}
        onOpen={composer.open}
      />
    </div>
  ) : tab === "note" ? (
    <div className="note-editor">
      <SourceNoteEditor workspace={workspace} composer={composer} />
    </div>
  ) : (
    <CitationEditor workspace={workspace} />
  );
}

function SourceNoteEditor({
  workspace,
  composer,
}: {
  readonly workspace: ReaderSourceWorkspaceController;
  readonly composer: AnnotationComposerController;
}): JSX.Element {
  const [insertion, setInsertion] = useState<TextInsertionRequest | null>(null);
  const annotationCandidates = useMemo(
    () =>
      workspace.annotations.status === "ready"
        ? workspace.annotations.value.map(annotationWikiCandidate)
        : [],
    [workspace.annotations],
  );
  const insert = (text: string, wordBounded = false): void => {
    setInsertion((current) => ({ requestId: (current?.requestId ?? 0) + 1, text, wordBounded }));
  };
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
  if (!workspace.draftReady) {
    return <div className="editor-loading">Opening source note…</div>;
  }
  const citekey = sourceRecord.value.citation?.id;
  return (
    <>
      <div className="source-note-toolbar">
        <span>Source note</span>
        <div>
          <details className="annotation-insert-menu">
            <summary aria-disabled={annotationCandidates.length === 0}>Insert annotation</summary>
            <div>
              <strong>Annotations on this source</strong>
              {annotationCandidates.map((candidate) => (
                <button
                  key={candidate.path}
                  type="button"
                  disabled={workspace.draft.includes(`![[${candidate.path}]]`)}
                  title={
                    workspace.draft.includes(`![[${candidate.path}]]`)
                      ? "Already embedded in this note"
                      : "Insert at the cursor"
                  }
                  onClick={() => insert(`![[${candidate.path}]]`)}
                >
                  <span>
                    {workspace.draft.includes(`![[${candidate.path}]]`)
                      ? "In note"
                      : candidate.kind}{" "}
                    · {candidate.detail}
                  </span>
                  <strong>{candidate.label}</strong>
                  {candidate.quote ? <small>{candidate.quote}</small> : null}
                </button>
              ))}
            </div>
          </details>
          <button
            type="button"
            disabled={!citekey}
            title={citekey ? `Insert [@${citekey}] at the cursor` : "Add citation metadata first"}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => citekey && insert(`[@${citekey}]`, true)}
          >
            <CitationIcon />
            {citekey ? `Insert [@${citekey}]` : "Citation required"}
          </button>
        </div>
      </div>
      <Suspense fallback={<div className="editor-loading">Opening source note…</div>}>
        <MarkdownEditor
          className="source-note-editor-surface"
          value={workspace.draft}
          ariaLabel="Source literature note"
          onChange={workspace.setDraft}
          onBlur={workspace.saveDraft}
          insertion={insertion}
          wikiLinks={annotationCandidates}
          onOpenWikiLink={(path) => {
            if (workspace.annotations.status !== "ready") {
              return;
            }
            const annotation = workspace.annotations.value.find(
              (item) => annotationWikiPath(item) === path,
            );
            if (annotation) {
              composer.open(annotation);
            }
          }}
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
