import { ReaderButton } from "@mdbase-reader/ui";

import { MultilineCodeEditor } from "./MultilineCodeEditor.js";

import type { CitationEditorController } from "./use-citation-editor.js";
import type { ReaderWorkspaceController } from "./use-reader-workspace.js";
import type { Source } from "@mdbase-reader/core";
import type { JSX } from "react";

export function CitationEditor({
  workspace,
}: {
  readonly workspace: ReaderWorkspaceController;
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
  const citation = editor.assessment.value ?? null;
  const citekey = textField(citation?.["id"]);
  const type = textField(citation?.["type"]);
  const title = textField(citation?.["title"]) ?? source.title;
  return (
    <div className="citation-editor">
      <header className="citation-bookplate">
        <strong>{title}</strong>
        <div className="citation-identity">
          <span>CSL–JSON</span>
          <span className={citekey ? "citation-key" : "citation-key is-empty"}>
            {citekey ? `@${citekey}` : "citekey required"}
          </span>
          <span>{type ?? "type required"}</span>
        </div>
      </header>
      <div className="citation-editor-heading">
        <div>
          <strong>Citation data</strong>
          <span>All CSL fields are kept exactly as entered.</span>
        </div>
        <CitationValidity valid={editor.assessment.valid} />
      </div>
      <MultilineCodeEditor
        className="citation-json"
        ariaLabel="CSL JSON citation metadata"
        language="json"
        value={editor.draft}
        onChange={editor.setDraft}
      />
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
  readonly resource: Exclude<ReaderWorkspaceController["sourceRecord"], { status: "ready" }>;
}): JSX.Element {
  return resource.status === "error" ? (
    <div className="inspector-status is-error" role="alert">
      {resource.message}
    </div>
  ) : (
    <div className="inspector-status">Opening citation metadata…</div>
  );
}

function CitationValidity({ valid }: { readonly valid: boolean }): JSX.Element {
  return (
    <span className={valid ? "is-valid" : "is-invalid"}>
      {valid ? "Valid CSL" : "Needs attention"}
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
  const message = editor.assessment.valid
    ? editor.status === "saved"
      ? "Saved to this source."
      : editor.suggested
        ? "Suggested from source metadata. Review before saving."
        : !editor.dirty
          ? "Saved to this source."
          : "Ready to save."
    : editor.assessment.message;
  return (
    <div className="citation-feedback" aria-live="polite">
      <span className={editor.assessment.valid ? undefined : "is-error"}>{message}</span>
    </div>
  );
}

function textField(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
