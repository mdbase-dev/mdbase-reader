import { lazy, Suspense, useContext, useMemo, useState, type JSX } from "react";

import { annotationWikiCandidate, annotationWikiPath } from "./annotation-wiki-candidates.js";
import { DraftRecoveryNotice } from "./DraftRecoveryNotice.js";
import { CitationIcon, HighlightIcon } from "./icons.js";
import {
  sourceNoteCitationCandidates,
  sourceNoteWikiCandidates,
} from "./source-note-references.js";
import { SourceLibraryContext } from "./SourceLibraryContext.js";

import type { AnnotationComposerController } from "./use-annotation-composer.js";
import type { ReaderSourceWorkspaceController } from "./use-reader-workspace.js";
import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type { SourceId, SourceSummary } from "@mdbase-reader/core";
import type {
  MarkdownCommandName,
  MarkdownCommandRequest,
  TextInsertionRequest,
} from "@mdbase-reader/markdown-editor";

const MarkdownEditor = lazy(async () => {
  const module = await import("@mdbase-reader/markdown-editor");
  return { default: module.MarkdownEditor };
});

// Source notes coordinate formatting, reference discovery, and autosave status.
export function SourceNoteEditor({
  workspace,
  composer,
  onOpenSourceView,
}: {
  readonly workspace: ReaderSourceWorkspaceController;
  readonly composer: AnnotationComposerController;
  readonly gateway: ReaderWorkspaceGateway;
  readonly onOpenSourceView?: (sourceId: SourceId, view: "document" | "citation") => void;
}): JSX.Element {
  const [insertion, setInsertion] = useState<TextInsertionRequest | null>(null);
  const [formatting, setFormatting] = useState<MarkdownCommandRequest | null>(null);
  const librarySources = useContext(SourceLibraryContext);
  const annotationCandidates = useMemo(
    () =>
      workspace.annotations.status === "ready"
        ? workspace.annotations.value.map(annotationWikiCandidate)
        : [],
    [workspace.annotations],
  );
  const wikiLinks = useMemo(
    () =>
      sourceNoteWikiCandidates(
        librarySources,
        workspace.annotations.status === "ready" ? workspace.annotations.value : [],
      ),
    [librarySources, workspace.annotations],
  );
  const citations = useMemo(() => sourceNoteCitationCandidates(librarySources), [librarySources]);
  const insert = (text: string, wordBounded = false): void => {
    setInsertion((current) => ({ requestId: (current?.requestId ?? 0) + 1, text, wordBounded }));
  };
  const format = (name: MarkdownCommandName): void => {
    setFormatting((current) => ({ requestId: (current?.requestId ?? 0) + 1, name }));
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
        <MarkdownFormatToolbar onFormat={format} />
        <div className="source-note-actions">
          <SaveStatus
            status={workspace.saveStatus}
            locallySaved={workspace.draftRecovery?.locallySaved ?? false}
            conflict={Boolean(workspace.draftRecovery?.conflict)}
          />
          <AnnotationInsertMenu
            candidates={annotationCandidates}
            draft={workspace.draft}
            onInsert={(path) => insert(`![[${path}]]`)}
          />
          <button
            type="button"
            disabled={!citekey}
            title={citekey ? `Insert [@${citekey}] at the cursor` : "Add citation metadata first"}
            aria-label={citekey ? `Insert citation ${citekey}` : "Citation metadata required"}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => citekey && insert(`[@${citekey}]`, true)}
          >
            <CitationIcon /> Citation
          </button>
        </div>
      </div>
      <DraftRecoveryNotice workspace={workspace} />
      <Suspense fallback={<div className="editor-loading">Opening source note…</div>}>
        <MarkdownEditor
          className="source-note-editor-surface"
          value={workspace.draft}
          ariaLabel="Source literature note"
          onChange={workspace.setDraft}
          onBlur={() => (workspace.draftRecovery?.recovered ? undefined : workspace.saveDraft())}
          onSave={workspace.saveDraft}
          insertion={insertion}
          formatting={formatting}
          wikiLinks={wikiLinks}
          citations={citations}
          onOpenWikiLink={(path) => activateAnnotation(path, workspace, composer.open)}
          onEditWikiLink={(path) => activateAnnotation(path, workspace, composer.edit)}
          onOpenCitation={(id) =>
            activateCitation(id, librarySources, "document", onOpenSourceView)
          }
          onEditCitation={(id) =>
            activateCitation(id, librarySources, "citation", onOpenSourceView)
          }
        />
      </Suspense>
      {workspace.saveError ? (
        <div className="editor-save-status is-error" role="alert">
          <span>{workspace.saveError}</span>
          <button
            type="button"
            disabled={Boolean(workspace.draftRecovery?.conflict)}
            onClick={workspace.saveDraft}
          >
            Retry save
          </button>
        </div>
      ) : null}
    </>
  );
}

function activateCitation(
  citekey: string,
  sources: readonly SourceSummary[],
  view: "document" | "citation",
  action: ((sourceId: SourceId, view: "document" | "citation") => void) | undefined,
): void {
  const source = sources.find((candidate) => candidate.citation?.id === citekey);
  if (source) {
    action?.(source.id, view);
  }
}

function activateAnnotation(
  path: string,
  workspace: ReaderSourceWorkspaceController,
  action: AnnotationComposerController["open"],
): void {
  if (workspace.annotations.status !== "ready") {
    return;
  }
  const annotation = workspace.annotations.value.find((item) => annotationWikiPath(item) === path);
  if (annotation) {
    action(annotation);
  }
}

function SaveStatus({
  status,
  locallySaved,
  conflict,
}: {
  readonly status: ReaderSourceWorkspaceController["saveStatus"];
  readonly locallySaved: boolean;
  readonly conflict: boolean;
}): JSX.Element {
  const label = conflict
    ? "Conflict"
    : status === "saving"
      ? "Saving to collection…"
      : status === "saved"
        ? "Saved to collection"
        : locallySaved
          ? "Saved locally"
          : "Not saved";
  return (
    <span className={`source-note-save-state is-${status}`} role="status" aria-live="polite">
      {label}
    </span>
  );
}

function AnnotationInsertMenu({
  candidates,
  draft,
  onInsert,
}: {
  readonly candidates: readonly ReturnType<typeof annotationWikiCandidate>[];
  readonly draft: string;
  readonly onInsert: (path: string) => void;
}): JSX.Element {
  return (
    <details className="annotation-insert-menu">
      <summary aria-disabled={candidates.length === 0}>
        <HighlightIcon /> Annotation
      </summary>
      <div>
        <strong>Annotations on this source</strong>
        {candidates.map((candidate) => {
          const embedded = draft.includes(`![[${candidate.path}]]`);
          return (
            <button
              key={candidate.path}
              type="button"
              disabled={embedded}
              title={embedded ? "Already embedded in this note" : "Insert at the cursor"}
              onClick={() => onInsert(candidate.path)}
            >
              <span>
                {embedded ? "In note" : candidate.kind} · {candidate.detail}
              </span>
              <strong>{candidate.label}</strong>
              {candidate.quote ? <small>{candidate.quote}</small> : null}
            </button>
          );
        })}
      </div>
    </details>
  );
}

const formatActions: readonly {
  readonly name: MarkdownCommandName;
  readonly label: string;
  readonly symbol: string;
  readonly shortcut: string;
}[] = [
  { name: "strong", label: "Bold", symbol: "B", shortcut: "⌘B" },
  { name: "emphasis", label: "Italic", symbol: "I", shortcut: "⌘I" },
  { name: "link", label: "Link", symbol: "↗", shortcut: "⌘K" },
  { name: "heading", label: "Heading", symbol: "H", shortcut: "⌘⌥2" },
  { name: "quote", label: "Quote", symbol: "“", shortcut: "⌘⇧." },
  { name: "bullet-list", label: "Bullet list", symbol: "•", shortcut: "⌘⇧8" },
  { name: "inline-code", label: "Inline code", symbol: "<>", shortcut: "⌘`" },
];

function MarkdownFormatToolbar({
  onFormat,
}: {
  readonly onFormat: (name: MarkdownCommandName) => void;
}): JSX.Element {
  return (
    <div className="source-note-formatting" role="toolbar" aria-label="Format Markdown">
      {formatActions.map((action) => (
        <button
          key={action.name}
          type="button"
          aria-label={action.label}
          title={`${action.label} · ${action.shortcut}`}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => onFormat(action.name)}
        >
          {action.name === "emphasis" ? <em>{action.symbol}</em> : action.symbol}
        </button>
      ))}
    </div>
  );
}
