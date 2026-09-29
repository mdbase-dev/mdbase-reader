import { SaveNotice } from "@mdbase-dev/ui/save-notice";
import { citationGapsFromSource, sourceCitationDifferences } from "@mdbase-reader/core";
import { ReaderButton } from "@mdbase-reader/ui";
import { useState, type JSX } from "react";

import { writeCitationDrag } from "./citation-drag.js";
import { CitationLookup } from "./CitationLookup.js";
import { CitationPreview } from "./CitationPreview.js";
import { CitationGapFill, CitationSourceSync } from "./CitationSourceSync.js";
import { CitationStructuredEditor } from "./CitationStructuredEditor.js";
import { MultilineCodeEditor } from "./MultilineCodeEditor.js";

import type { CitationEditorController } from "./use-citation-editor.js";
import type { ReaderSourceWorkspaceController } from "./use-reader-workspace.js";
import type { SourceFieldsController } from "./use-source-fields.js";
import type { Source } from "@mdbase-reader/core";

export function CitationEditor({
  workspace,
}: {
  readonly workspace: ReaderSourceWorkspaceController;
}): JSX.Element {
  const sourceRecord = workspace.sourceRecord;
  if (sourceRecord.status !== "ready") {
    return <CitationLoadStatus resource={sourceRecord} />;
  }
  return (
    <ReadyCitationEditor
      source={sourceRecord.value}
      editor={workspace.citation}
      sourceFields={workspace.sourceFields}
    />
  );
}

// The editor deliberately renders validity, quality, and mode states in one transaction.
// eslint-disable-next-line complexity
function ReadyCitationEditor({
  source,
  editor,
  sourceFields,
}: {
  readonly source: Source;
  readonly editor: CitationEditorController;
  readonly sourceFields: SourceFieldsController;
}): JSX.Element {
  const [mode, setMode] = useState<"fields" | "raw">("fields");
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const citation = editor.assessment.value ?? {};
  const validCitation = editor.assessment.valid ? editor.assessment.value : null;
  const citekey = textField(citation["id"]);
  const title = textField(citation["title"]) ?? source.title;
  return (
    <div className="citation-editor">
      <header
        className="citation-bookplate"
        aria-label={`Citation metadata for ${title}`}
        draggable={validCitation !== null}
        title={validCitation ? "Drag to insert this citation" : undefined}
        onDragStart={(event) =>
          validCitation && writeCitationDrag(event.dataTransfer, validCitation)
        }
      >
        <div className="citation-readiness">
          <CitationValidity
            valid={editor.assessment.valid}
            warnings={editor.warnings.length}
            onShowSuggestions={() => setSuggestionsOpen(true)}
          />
          <code className={citekey ? undefined : "is-empty"}>
            {citekey ? `@${citekey}` : "Citation key needed"}
          </code>
        </div>
        <nav className="citation-editor-tabs" aria-label="Citation editor mode">
          <button
            type="button"
            aria-current={mode === "fields" ? "page" : undefined}
            onClick={() => setMode("fields")}
          >
            Details
          </button>
          <button
            type="button"
            aria-current={mode === "raw" ? "page" : undefined}
            onClick={() => setMode("raw")}
          >
            CSL
          </button>
        </nav>
      </header>

      {validCitation ? <CitationPreview citation={validCitation} /> : null}

      <div className="citation-editor-body">
        {!editor.dirty && source.citation && sourceFields.available ? (
          <CitationSourceSync
            differences={sourceCitationDifferences(source.frontmatter, source.citation)}
            controller={sourceFields}
          />
        ) : null}
        {editor.assessment.value ? (
          <CitationGapFill
            gaps={citationGapsFromSource(editor.assessment.value, source)}
            onApply={(gaps) => editor.setCitation({ ...citation, ...gaps })}
          />
        ) : null}
        {mode === "fields" ? (
          <>
            <CitationLookup citation={citation} editor={editor} />
            <CitationStructuredEditor
              citation={citation}
              problems={editor.assessment.valid ? [] : (editor.assessment.problems ?? [])}
              onChange={editor.setCitation}
              onRegenerateCitekey={editor.regenerateCitekey}
            />
          </>
        ) : (
          <div className="citation-raw-editor">
            <div>
              <strong>CSL-JSON</strong>
              <span>Every official field is preserved exactly as entered.</span>
            </div>
            <MultilineCodeEditor
              className="citation-json"
              ariaLabel="CSL JSON citation metadata"
              language="json"
              value={editor.draft}
              onChange={editor.setDraft}
              onSave={editor.save}
            />
          </div>
        )}
      </div>

      <footer className="citation-editor-footer">
        <CitationFeedback
          editor={editor}
          suggestionsOpen={suggestionsOpen}
          onSuggestionsToggle={setSuggestionsOpen}
        />
        <ReaderButton
          disabled={!editor.assessment.valid || !editor.dirty || editor.status === "saving"}
          onClick={editor.save}
        >
          {editor.status === "saving" ? "Saving…" : "Save changes"}
        </ReaderButton>
      </footer>
    </div>
  );
}

function CitationLoadStatus({
  resource,
}: {
  readonly resource: Exclude<ReaderSourceWorkspaceController["sourceRecord"], { status: "ready" }>;
}): JSX.Element {
  return resource.status === "error" ? (
    <div className="inspector-status is-error" role="alert">
      {resource.message}
    </div>
  ) : (
    <div className="inspector-status">Opening citation metadata…</div>
  );
}

/** Readiness stays calm when the citation is valid; suggestions are one click away. */
function CitationValidity({
  valid,
  warnings,
  onShowSuggestions,
}: {
  readonly valid: boolean;
  readonly warnings: number;
  readonly onShowSuggestions: () => void;
}): JSX.Element {
  if (!valid) {
    return <span className="is-invalid">Incomplete</span>;
  }
  const suggestions = `${String(warnings)} quality ${warnings === 1 ? "suggestion" : "suggestions"}`;
  return (
    <span className="is-valid">
      Ready
      {warnings ? (
        <button
          type="button"
          className="citation-suggestion-count"
          aria-label={`Show ${suggestions}`}
          title={suggestions}
          onClick={onShowSuggestions}
        >
          {warnings}
        </button>
      ) : null}
    </span>
  );
}

function CitationFeedback({
  editor,
  suggestionsOpen,
  onSuggestionsToggle,
}: {
  readonly editor: CitationEditorController;
  readonly suggestionsOpen: boolean;
  readonly onSuggestionsToggle: (open: boolean) => void;
}): JSX.Element {
  if (editor.error) {
    return (
      <div className="citation-feedback" aria-live="polite">
        <span className="is-error" role="alert">
          {editor.error}
        </span>
      </div>
    );
  }
  if (!editor.assessment.valid) {
    return (
      <div className="citation-feedback" aria-live="polite">
        <strong>Fix before saving</strong>
        <span className="is-error">{editor.assessment.message}</span>
      </div>
    );
  }
  if (editor.warnings.length) {
    return (
      <details
        className="citation-feedback"
        open={suggestionsOpen}
        onToggle={(event) => onSuggestionsToggle(event.currentTarget.open)}
      >
        <summary>
          {editor.warnings.length} quality{" "}
          {editor.warnings.length === 1 ? "suggestion" : "suggestions"}
        </summary>
        {editor.warnings.map((warning) => (
          <span key={warning}>{warning}</span>
        ))}
      </details>
    );
  }
  return (
    <div className="citation-feedback mdbase-settle-host" aria-live="polite">
      {editor.suggested && editor.status !== "saved" ? (
        <span>Review the suggested details before saving.</span>
      ) : editor.status === "saved" || !editor.dirty ? (
        <SaveNotice tone="saved" />
      ) : (
        <SaveNotice tone="pending" label="Unsaved changes" />
      )}
    </div>
  );
}

function textField(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
