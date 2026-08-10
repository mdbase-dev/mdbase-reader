import { ReaderButton } from "@mdbase-reader/ui";
import { useState, type JSX } from "react";

import { writeCitationDrag } from "./citation-drag.js";
import { CitationLookup } from "./CitationLookup.js";
import { CitationPreview } from "./CitationPreview.js";
import { CitationStructuredEditor } from "./CitationStructuredEditor.js";
import { MultilineCodeEditor } from "./MultilineCodeEditor.js";

import type { CitationEditorController } from "./use-citation-editor.js";
import type { ReaderSourceWorkspaceController } from "./use-reader-workspace.js";
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
  return <ReadyCitationEditor source={sourceRecord.value} editor={workspace.citation} />;
}

function ReadyCitationEditor({
  source,
  editor,
}: {
  readonly source: Source;
  readonly editor: CitationEditorController;
}): JSX.Element {
  const [mode, setMode] = useState<"fields" | "raw">("fields");
  const citation = editor.assessment.value ?? {};
  const validCitation = editor.assessment.valid ? editor.assessment.value : null;
  const citekey = textField(citation["id"]);
  const type = textField(citation["type"]);
  const title = textField(citation["title"]) ?? source.title;
  return (
    <div className="citation-editor">
      <header
        className="citation-bookplate"
        draggable={validCitation !== null}
        title={validCitation ? "Drag to insert this citation" : undefined}
        onDragStart={(event) =>
          validCitation && writeCitationDrag(event.dataTransfer, validCitation)
        }
      >
        <div className="citation-bookplate-copy">
          <span>Citation record</span>
          <strong>{title}</strong>
        </div>
        <div className="citation-identity">
          <span className={citekey ? "citation-key" : "citation-key is-empty"}>
            {citekey ? `@${citekey}` : "citekey required"}
          </span>
          <span>{type ?? "type required"}</span>
          <CitationValidity valid={editor.assessment.valid} warnings={editor.warnings.length} />
        </div>
      </header>

      {validCitation ? <CitationPreview citation={validCitation} /> : null}

      <nav className="citation-editor-tabs" aria-label="Citation editor mode">
        <button
          type="button"
          aria-current={mode === "fields" ? "page" : undefined}
          onClick={() => setMode("fields")}
        >
          Fields
        </button>
        <button
          type="button"
          aria-current={mode === "raw" ? "page" : undefined}
          onClick={() => setMode("raw")}
        >
          Raw CSL
        </button>
      </nav>

      <main className="citation-editor-body">
        {mode === "fields" ? (
          <>
            <CitationLookup citation={citation} editor={editor} />
            <CitationStructuredEditor
              citation={citation}
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
            />
          </div>
        )}
      </main>

      <footer className="citation-editor-footer">
        <CitationFeedback editor={editor} />
        <ReaderButton
          disabled={!editor.assessment.valid || !editor.dirty || editor.status === "saving"}
          onClick={editor.save}
        >
          {editor.status === "saving" ? "Saving…" : "Save citation"}
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

function CitationValidity({
  valid,
  warnings,
}: {
  readonly valid: boolean;
  readonly warnings: number;
}): JSX.Element {
  return (
    <span className={valid ? (warnings ? "is-warning" : "is-valid") : "is-invalid"}>
      {valid
        ? warnings
          ? `${String(warnings)} ${warnings === 1 ? "suggestion" : "suggestions"}`
          : "Complete"
        : "Needs attention"}
    </span>
  );
}

function CitationFeedback({ editor }: { readonly editor: CitationEditorController }): JSX.Element {
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
      <details className="citation-feedback">
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
  const message =
    editor.status === "saved"
      ? "Saved to this source."
      : editor.suggested
        ? "Suggested from source metadata. Review before saving."
        : !editor.dirty
          ? "Saved to this source."
          : "Ready to save.";
  return (
    <div className="citation-feedback" aria-live="polite">
      <span>{message}</span>
    </div>
  );
}

function textField(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
