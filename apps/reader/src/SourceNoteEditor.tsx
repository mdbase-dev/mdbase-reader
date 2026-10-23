import { t as translate } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { shortcutLabel } from "@mdbase-dev/ui/command-palette";
import { SaveNotice, type SaveTone } from "@mdbase-dev/ui/save-notice";
import { lazy, Suspense, useContext, useMemo, useState, type JSX, type ReactNode } from "react";

import { annotationWikiCandidate, annotationWikiPath } from "./annotation-wiki-candidates.js";
import { DraftRecoveryNotice } from "./DraftRecoveryNotice.js";
import { CodeIcon, LinkIcon, ListIcon, QuoteIcon } from "./icons.js";
import {
  sourceNoteCitationCandidates,
  sourceNoteWikiCandidates,
} from "./source-note-references.js";
import { SourceDetails } from "./SourceDetails.js";
import { SourceLibraryContext } from "./SourceLibraryContext.js";
import { SourceNoteInsertMenu } from "./SourceNoteInsertMenu.js";
import { SLOW_SAVE_MS, useSustained } from "./use-sustained.js";

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
interface SourceNoteEditorProps {
  readonly workspace: ReaderSourceWorkspaceController;
  readonly composer: AnnotationComposerController;
  readonly gateway: ReaderWorkspaceGateway;
  readonly onOpenSourceView?: (sourceId: SourceId, view: "document" | "citation") => void;
}

export function SourceNoteEditor({
  workspace,
  composer,
  onOpenSourceView,
}: SourceNoteEditorProps): JSX.Element {
  const { t } = useLingui();
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
      <div className="editor-loading">
        <Trans>Opening literature note…</Trans>
      </div>
    );
  }
  if (!workspace.draftReady) {
    return (
      <div className="editor-loading">
        <Trans>Opening literature note…</Trans>
      </div>
    );
  }
  const citekey = sourceRecord.value.citation?.id;
  return (
    <>
      <div className="source-note-toolbar mdbase-settle-host">
        <MarkdownFormatToolbar onFormat={format} />
        <SaveStatus
          status={workspace.saveStatus}
          locallySaved={workspace.draftRecovery?.locallySaved ?? false}
          conflict={Boolean(workspace.draftRecovery?.conflict)}
        />
        <SourceNoteInsertMenu
          citekey={citekey}
          candidates={annotationCandidates}
          draft={workspace.draft}
          onInsertCitation={(key) => insert(`[@${key}]`, true)}
          onInsertAnnotation={(path) => insert(`![[${path}]]`)}
        />
      </div>
      <SourceDetails
        source={sourceRecord.value}
        controller={workspace.sourceFields}
        {...(onOpenSourceView
          ? { onOpenCitation: () => onOpenSourceView(sourceRecord.value.id, "citation") }
          : {})}
      />
      <DraftRecoveryNotice workspace={workspace} />
      <Suspense
        fallback={
          <div className="editor-loading">
            <Trans>Opening literature note…</Trans>
          </div>
        }
      >
        <MarkdownEditor
          className="source-note-editor-surface"
          value={workspace.draft}
          {...(workspace.draftDocument ? { sharedDocument: workspace.draftDocument } : {})}
          ariaLabel={t({ message: "Source literature note" })}
          onChange={workspace.setDraft}
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
            <Trans>Retry save</Trans>
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
  // Autosaves usually finish at once; until one runs long, keep showing the unsaved state.
  const slowSave = useSustained(status === "saving", SLOW_SAVE_MS);
  const [tone, label, detail]: readonly [SaveTone, string, string | undefined] = conflict
    ? [
        "attention",
        translate({ message: "Conflict", context: "SourceNoteEditor status or action" }),
        translate({
          message:
            "The collection changed while you were editing. Review the conflict to continue.",
        }),
      ]
    : slowSave
      ? [
          "saving",
          translate({ message: "Saving…", context: "SourceNoteEditor status or action" }),
          undefined,
        ]
      : status === "saved"
        ? [
            "saved",
            translate({ message: "Saved", context: "SourceNoteEditor status or action" }),
            translate({ message: "Saved to your collection" }),
          ]
        : locallySaved
          ? [
              "pending",
              translate({ message: "Saved locally", context: "SourceNoteEditor status or action" }),
              translate({ message: "Kept on this device until the collection can be reached" }),
            ]
          : [
              "attention",
              translate({ message: "Not saved", context: "SourceNoteEditor status or action" }),
              undefined,
            ];
  return (
    <span className="source-note-save-state" title={detail}>
      <SaveNotice tone={tone} label={label} />
    </span>
  );
}

function formatActions(): readonly {
  readonly name: MarkdownCommandName;
  readonly label: string;
  readonly symbol: ReactNode;
  readonly shortcut: string;
}[] {
  return [
    {
      name: "strong",
      label: translate({ message: "Bold", context: "SourceNoteEditor formatActions" }),
      symbol: <b>B</b>,
      shortcut: "mod+b",
    },
    {
      name: "emphasis",
      label: translate({ message: "Italic", context: "SourceNoteEditor formatActions" }),
      symbol: <em>I</em>,
      shortcut: "mod+i",
    },
    {
      name: "heading",
      label: translate({ message: "Heading", context: "SourceNoteEditor formatActions" }),
      symbol: <b>H</b>,
      shortcut: "mod+alt+2",
    },
    {
      name: "link",
      label: translate({ message: "Link", context: "SourceNoteEditor formatActions" }),
      symbol: <LinkIcon />,
      shortcut: "mod+k",
    },
    {
      name: "quote",
      label: translate({ message: "Quote", context: "SourceNoteEditor formatActions" }),
      symbol: <QuoteIcon />,
      shortcut: "mod+shift+.",
    },
    {
      name: "bullet-list",
      label: translate({ message: "Bullet list", context: "SourceNoteEditor formatActions" }),
      symbol: <ListIcon />,
      shortcut: "mod+shift+8",
    },
    {
      name: "inline-code",
      label: translate({ message: "Inline code", context: "SourceNoteEditor formatActions" }),
      symbol: <CodeIcon />,
      shortcut: "mod+`",
    },
  ];
}

function MarkdownFormatToolbar({
  onFormat,
}: {
  readonly onFormat: (name: MarkdownCommandName) => void;
}): JSX.Element {
  const { t } = useLingui();
  return (
    <div
      className="source-note-formatting"
      role="toolbar"
      aria-label={t({ message: "Format Markdown", context: "SourceNoteEditor interface" })}
    >
      {formatActions().map((action) => (
        <button
          key={action.name}
          type="button"
          aria-label={action.label}
          title={`${action.label} · ${shortcutLabel(action.shortcut)}`}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => onFormat(action.name)}
        >
          {action.symbol}
        </button>
      ))}
    </div>
  );
}
