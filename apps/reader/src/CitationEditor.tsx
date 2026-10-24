import { SaveNotice } from "@mdbase-dev/ui/save-notice";
import {
  citationGapsFromSource,
  cslFieldStatuses,
  sourceCitationDifferences,
} from "@mdbase-reader/core";
import { useEffect, useId, useRef, useState, type JSX } from "react";

import { citationDetailRows, citationHealth, uncoveredWarnings } from "./citation-tab-model.js";
import { CitationLookup } from "./CitationLookup.js";
import {
  CitationPreview,
  CitationPreviewLine,
  copyKeepingFocus,
  useCitationFormat,
} from "./CitationPreview.js";
import { CitationProvenance } from "./CitationProvenance.js";
import { CitationSaveConflict } from "./CitationSaveConflict.js";
import { CitationGapFill, CitationSourceSync } from "./CitationSourceSync.js";
import { CitationStructuredEditor } from "./CitationStructuredEditor.js";
import { requestConfirmation } from "./confirmation.js";
import { BackIcon, CheckIcon, ChevronRightIcon, CopyIcon } from "./icons.js";
import { MultilineCodeEditor } from "./MultilineCodeEditor.js";
import { useSessionDisclosure } from "./use-session-choice.js";

import type { CitationEditorController } from "./use-citation-editor.js";
import type { ReaderSourceWorkspaceController } from "./use-reader-workspace.js";
import type { SourceFieldsController } from "./use-source-fields.js";
import type { Source } from "@mdbase-reader/core";

import "./citation.css";

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
      key={sourceRecord.value.id}
      source={sourceRecord.value}
      editor={workspace.citation}
      sourceFields={workspace.sourceFields}
    />
  );
}

type CitationView =
  { readonly name: "summary"; readonly returned: boolean } | { readonly name: "fix" };

type Gaps = Readonly<Record<string, unknown>>;

/**
 * The Citation tab leads with the formatted citation and one way forward, Fix details. The
 * evidence, lookup and CSL-JSON wait in disclosures. Both views edit the same draft.
 */
function ReadyCitationEditor({
  source,
  editor,
  sourceFields,
}: {
  readonly source: Source;
  readonly editor: CitationEditorController;
  readonly sourceFields: SourceFieldsController;
}): JSX.Element {
  const [view, setView] = useState<CitationView>({ name: "summary", returned: false });
  const format = useCitationFormat();
  const validCitation = editor.assessment.valid ? editor.assessment.value : null;
  const gaps = citationGaps(editor, source);
  const health = citationHealth({
    valid: editor.assessment.valid,
    message: editor.assessment.valid ? undefined : editor.assessment.message,
    warnings: editor.warnings,
    gaps: Object.keys(gaps),
  });
  const discard = (): void => {
    void confirmCitationDiscard().then((accepted) => {
      if (accepted) {
        editor.discard();
        setView({ name: "summary", returned: true });
      }
    });
  };
  const canDiscard = editor.dirty && editor.conflict === null && editor.status !== "saving";
  return (
    <div className="citation-editor" data-view={view.name}>
      {view.name === "summary" ? (
        <CitationSummaryView
          source={source}
          editor={editor}
          sourceFields={sourceFields}
          health={health}
          format={format}
          focusFix={view.returned}
          onFix={() => setView({ name: "fix" })}
        />
      ) : (
        <CitationFixView
          editor={editor}
          gaps={gaps}
          health={health}
          onBack={() => setView({ name: "summary", returned: true })}
          onDiscard={canDiscard ? discard : undefined}
        />
      )}
      {footerVisible(view, editor) ? (
        <footer className="citation-editor-footer">
          {view.name === "fix" ? (
            <CitationPreviewLine citation={validCitation} format={format} />
          ) : null}
          <div className="citation-footer-row">
            <CitationFeedback editor={editor} showValidity={view.name === "fix"} />
            {/* An unreadable draft offers Discard changes in the view itself. */}
            {view.name === "fix" && canDiscard && editor.assessment.value ? (
              <button type="button" className="citation-button" onClick={discard}>
                Discard changes
              </button>
            ) : null}
            <SaveDetailsButton editor={editor} />
          </div>
        </footer>
      ) : null}
    </div>
  );
}

/**
 * The summary view shows the footer only while there is something to save or say. It stays after
 * a save, so the “Saved” notice is seen and focus stays on Save details rather than falling away.
 */
function footerVisible(view: CitationView, editor: CitationEditorController): boolean {
  return (
    view.name === "fix" ||
    editor.dirty ||
    editor.suggested ||
    editor.conflict !== null ||
    editor.error !== null ||
    editor.status !== "idle"
  );
}

function confirmCitationDiscard(): Promise<boolean> {
  return requestConfirmation({
    title: "Discard changes?",
    message: "Your edits to these citation details will be lost.",
    confirmLabel: "Discard changes",
    cancelLabel: "Keep editing",
    danger: true,
  });
}

/** Fields the library records but the citation lacks, except those deliberately removed. */
function citationGaps(editor: CitationEditorController, source: Source): Gaps {
  const citation = editor.assessment.value;
  if (!citation) {
    return {};
  }
  const statuses = cslFieldStatuses(citation, editor.provenance);
  return Object.fromEntries(
    Object.entries(citationGapsFromSource(citation, source)).filter(
      ([field]) => statuses[field]?.kind !== "removed",
    ),
  );
}

function CitationSummaryView({
  source,
  editor,
  sourceFields,
  health,
  format,
  focusFix,
  onFix,
}: {
  readonly source: Source;
  readonly editor: CitationEditorController;
  readonly sourceFields: SourceFieldsController;
  readonly health: ReturnType<typeof citationHealth>;
  readonly format: ReturnType<typeof useCitationFormat>;
  /** Returning from Fix details puts focus back on the button that opened it. */
  readonly focusFix: boolean;
  readonly onFix: () => void;
}): JSX.Element {
  const citation = editor.assessment.value ?? {};
  return (
    <div className="citation-editor-body citation-summary">
      <CitationPreview
        citation={editor.assessment.valid ? editor.assessment.value : null}
        format={format}
      />
      <CitationHealthLine
        health={health}
        primary={!editor.dirty}
        focusOnMount={focusFix}
        onFix={onFix}
      />
      {!editor.dirty && source.citation && sourceFields.available ? (
        <CitationSourceSync
          differences={sourceCitationDifferences(source.frontmatter, source.citation)}
          controller={sourceFields}
        />
      ) : null}
      <CitationDetails citation={citation} />
      <div className="citation-disclosures">
        <CitationProvenance
          citation={citation}
          provenance={editor.provenance}
          onChange={editor.setCitation}
        />
        <CitationLookup key={source.id} citation={citation} editor={editor} />
        <CitationJson editor={editor} />
      </div>
    </div>
  );
}

function CitationFixView({
  editor,
  gaps,
  health,
  onBack,
  onDiscard,
}: {
  readonly editor: CitationEditorController;
  readonly gaps: Gaps;
  readonly health: ReturnType<typeof citationHealth>;
  readonly onBack: () => void;
  /** Absent when there is nothing to discard. */
  readonly onDiscard: (() => void) | undefined;
}): JSX.Element {
  const citation = editor.assessment.value;
  const back = useRef<HTMLButtonElement>(null);
  useEffect(() => back.current?.focus(), []);
  return (
    <div className="citation-editor-body citation-fix">
      <header className="citation-fix-head">
        <button
          ref={back}
          type="button"
          className="citation-icon-button"
          aria-label="Back to citation"
          title="Back to citation"
          onClick={onBack}
        >
          <BackIcon />
        </button>
        <h3>{health.tone === "complete" ? "Edit details" : "Fix details"}</h3>
        {health.tone !== "complete" ? <span>{health.title}</span> : null}
      </header>
      {citation ? (
        <CitationFixForm editor={editor} citation={citation} gaps={gaps} />
      ) : (
        <CitationJsonBlocked
          message={editor.assessment.valid ? "" : editor.assessment.message}
          onDiscard={onDiscard}
        />
      )}
    </div>
  );
}

function CitationFixForm({
  editor,
  citation,
  gaps,
}: {
  readonly editor: CitationEditorController;
  readonly citation: Readonly<Record<string, unknown>>;
  readonly gaps: Gaps;
}): JSX.Element {
  const checks = editor.assessment.valid
    ? uncoveredWarnings(editor.warnings, Object.keys(gaps))
    : [];
  return (
    <>
      <CitationGapFill
        gaps={gaps}
        onApply={(fill) => editor.setCitation({ ...citation, ...fill })}
      />
      {checks.length ? (
        <ul className="citation-checks" aria-label="Details to check">
          {checks.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
      <CitationStructuredEditor
        citation={citation}
        problems={editor.assessment.valid ? [] : (editor.assessment.problems ?? [])}
        onChange={editor.setCitation}
        onRegenerateCitekey={editor.regenerateCitekey}
      />
    </>
  );
}

/**
 * When the CSL-JSON draft cannot be read as an object, the form would start from nothing and
 * its first edit would replace the whole draft. Ask for the JSON to be fixed or discarded instead.
 */
function CitationJsonBlocked({
  message,
  onDiscard,
}: {
  readonly message: string;
  readonly onDiscard: (() => void) | undefined;
}): JSX.Element {
  return (
    <div className="citation-json-blocked" role="alert">
      <strong>CSL-JSON has errors — fix them or discard</strong>
      <p>
        {message} The form opens once the CSL-JSON can be read; edit it under CSL-JSON in the
        citation view.
      </p>
      {onDiscard ? (
        <button type="button" className="citation-button" onClick={onDiscard}>
          Discard changes
        </button>
      ) : null}
    </div>
  );
}

function SaveDetailsButton({ editor }: { readonly editor: CitationEditorController }): JSX.Element {
  // aria-disabled, not disabled: a disabled button drops focus to the page when a save finishes.
  const unavailable =
    !editor.assessment.valid ||
    !editor.dirty ||
    editor.status === "saving" ||
    editor.conflict !== null;
  return (
    <button
      type="button"
      className="citation-button is-primary"
      aria-disabled={unavailable}
      onClick={unavailable ? undefined : editor.save}
    >
      <CheckIcon />
      {editor.status === "saving" ? "Saving…" : "Save details"}
    </button>
  );
}

function CitationHealthLine({
  health,
  primary,
  focusOnMount,
  onFix,
}: {
  readonly health: ReturnType<typeof citationHealth>;
  /** Save details takes the filled style while a draft is pending; one primary per surface. */
  readonly primary: boolean;
  readonly focusOnMount: boolean;
  readonly onFix: () => void;
}): JSX.Element {
  const needsFix = health.tone !== "complete";
  const button = useRef<HTMLButtonElement>(null);
  // Only on arrival: later renders must not pull focus back.
  const [focusOnArrival] = useState(focusOnMount);
  useEffect(() => {
    if (focusOnArrival) {
      button.current?.focus();
    }
  }, [focusOnArrival]);
  return (
    <div className={`citation-health is-${health.tone}`}>
      <div role="status">
        <strong>{health.title}</strong>
        {health.detail ? <span>{health.detail}</span> : null}
      </div>
      <button
        ref={button}
        type="button"
        className={`citation-button${needsFix && primary ? " is-primary" : ""}`}
        onClick={onFix}
      >
        {needsFix ? "Fix details" : "Edit details"}
      </button>
    </div>
  );
}

function CitationDetails({
  citation,
}: {
  readonly citation: Readonly<Record<string, unknown>>;
}): JSX.Element {
  const citekey = textField(citation["id"]);
  const heading = useId();
  return (
    <section className="citation-details" aria-labelledby={heading}>
      <h3 id={heading}>Citation details</h3>
      <dl>
        {citationDetailRows(citation).map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd className={row.value ? undefined : "is-empty"}>
              {row.value ?? (
                <>
                  Not set
                  {row.needed ? <span className="citation-needs-check">Needs checking</span> : null}
                </>
              )}
            </dd>
          </div>
        ))}
        <div>
          <dt>Citation key</dt>
          <dd className={citekey ? undefined : "is-empty"}>
            {citekey ? (
              <CitationKeyCopy citekey={citekey} />
            ) : (
              <>
                Not set<span className="citation-needs-check">Needs checking</span>
              </>
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}

/** Copies `@key`, saying so beside the key and in a live region, for success and failure alike. */
function CitationKeyCopy({ citekey }: { readonly citekey: string }): JSX.Element {
  const [result, setResult] = useState<"copied" | "failed" | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = (): void => {
    clearTimeout(timer.current);
    void copyKeepingFocus(`@${citekey}`).then(
      () => {
        setResult("copied");
        timer.current = setTimeout(() => setResult(null), 2400);
      },
      () => setResult("failed"),
    );
  };
  return (
    <>
      <button
        type="button"
        className="citation-key"
        aria-label={`Copy citation key @${citekey}`}
        title="Copy citation key"
        onClick={copy}
      >
        <code>@{citekey}</code>
        {result === "copied" ? <CheckIcon /> : <CopyIcon />}
      </button>
      <span className="citation-key-status" role="status">
        {result === "copied" ? "Copied" : result === "failed" ? "Copying is unavailable here." : ""}
      </span>
    </>
  );
}

function CitationJson({ editor }: { readonly editor: CitationEditorController }): JSX.Element {
  const disclosure = useSessionDisclosure("citation.csl-json");
  return (
    <details className="citation-disclosure citation-raw-editor" {...disclosure}>
      <summary>
        <ChevronRightIcon />
        <span>CSL-JSON</span>
        <small>Advanced</small>
      </summary>
      <p className="citation-disclosure-note">
        Citation Style Language in JSON format. Every field is preserved exactly as entered.
      </p>
      {disclosure.open ? (
        <MultilineCodeEditor
          className="citation-json"
          ariaLabel="CSL-JSON citation details"
          language="json"
          value={editor.draft}
          onChange={editor.setDraft}
          onSave={editor.save}
        />
      ) : null}
    </details>
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
    <div className="inspector-status">Opening citation details…</div>
  );
}

function CitationFeedback({
  editor,
  showValidity,
}: {
  readonly editor: CitationEditorController;
  /** The summary view states validity in its status line; only Fix details repeats it here. */
  readonly showValidity: boolean;
}): JSX.Element {
  if (editor.conflict) {
    return <CitationSaveConflict editor={editor} />;
  }
  if (editor.error) {
    return (
      <div className="citation-feedback" aria-live="polite">
        <span className="is-error" role="alert">
          {editor.error}
        </span>
      </div>
    );
  }
  if (!editor.assessment.valid && showValidity) {
    return (
      <div className="citation-feedback" aria-live="polite">
        <strong>Fix before saving</strong>
        <span className="is-error">{editor.assessment.message}</span>
      </div>
    );
  }
  return (
    <div className="citation-feedback mdbase-settle-host" aria-live="polite">
      {editor.suggested && editor.status !== "saved" ? (
        <span>Review the suggested details before saving.</span>
      ) : !editor.dirty ? (
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
