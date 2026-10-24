import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type JSX,
  type ReactNode,
} from "react";

import { ChapterPreview } from "./ChapterPreview.js";
import { useChapterCreation, type ChapterChoice } from "./use-chapter-creation.js";
import "./source-parts-library.css";

import type { ChapterOutline } from "./chapter-outline.js";
import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type { DocumentRange, Source, SourceSummary } from "@mdbase-reader/core";

function chapterCount(count: number): string {
  return `${String(count)} ${count === 1 ? "chapter" : "chapters"}`;
}

const CreationContext = createContext<((source: SourceSummary) => void) | null>(null);
export const useSourcePartCreation = (): ((source: SourceSummary) => void) | null =>
  useContext(CreationContext);

export function SourcePartCreation({
  gateway,
  onCreated,
  children,
  enabled = true,
}: {
  readonly gateway: ReaderWorkspaceGateway;
  readonly onCreated: (source: Source) => void;
  readonly enabled?: boolean;
  readonly children: ReactNode;
}): JSX.Element {
  const [book, setBook] = useState<SourceSummary | null>(null);
  return (
    <CreationContext value={enabled && gateway.createSourcePart ? setBook : null}>
      {children}
      {book ? (
        <ChapterCreationDialog
          key={book.id}
          gateway={gateway}
          book={book}
          onCreated={onCreated}
          onClose={() => setBook(null)}
        />
      ) : null}
    </CreationContext>
  );
}

function ChapterCreationDialog({
  gateway,
  book,
  onCreated,
  onClose,
}: {
  readonly gateway: ReaderWorkspaceGateway;
  readonly book: SourceSummary;
  readonly onCreated: (source: Source) => void;
  readonly onClose: () => void;
}): JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null);
  const model = useChapterCreation(gateway, book, onCreated, onClose);
  useEffect(() => {
    const launcher = window.document.activeElement;
    dialog.current?.showModal();
    return () => {
      if (launcher instanceof HTMLElement && launcher.isConnected) {
        launcher.focus();
      }
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="import-dialog source-parts-dialog"
      aria-labelledby="chapter-create-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!model.busy) {
          onClose();
        }
      }}
    >
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void model.confirm();
        }}
      >
        <h2 id="chapter-create-title">Add chapters as sources</h2>
        <p>In {book.title}. Chapters share the existing file; no files or annotations are moved.</p>
        {!model.outline && !model.problem ? (
          <p role="status">Reading the table of contents…</p>
        ) : null}
        {model.outline ? <ChapterChecklist model={model} outline={model.outline} /> : null}
        {model.problem ? <p role="alert">{model.problem}</p> : null}
        <p role="status">
          {model.completed
            ? `${chapterCount(model.completed)} created. You can retry without creating duplicates.`
            : `${chapterCount(model.plans.length)} selected. Nothing is created until you confirm.`}
        </p>
        <div className="source-parts-actions">
          <button className="mdbase-button" type="button" disabled={model.busy} onClick={onClose}>
            Cancel
          </button>
          <button
            className="mdbase-button"
            type="submit"
            disabled={model.busy || !model.plans.length}
          >
            {model.busy ? "Creating…" : "Confirm and create chapters"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function ChapterChecklist({
  model,
  outline,
}: {
  readonly model: ReturnType<typeof useChapterCreation>;
  readonly outline: ChapterOutline;
}): JSX.Element {
  return (
    <>
      <p>
        {outline.pageCount !== undefined
          ? `Use the page numbers in the PDF viewer, from 1 to ${String(outline.pageCount)}. Both the start and end pages are included. Printed page labels can be added separately.`
          : "Choose sections in reading order. The first and last sections are included in full."}
      </p>
      <fieldset disabled={model.busy || model.completed > 0}>
        <legend>Choose chapters and check where they start and end</legend>
        {model.choices.map((choice, index) => (
          <ChapterChoiceFields
            key={choice.key}
            choice={choice}
            index={index}
            outline={outline}
            update={(patch) => model.update(choice.key, patch)}
          />
        ))}
        <button className="mdbase-button" type="button" onClick={model.addManual}>
          Add a chapter manually
        </button>
        <label>
          <input
            type="checkbox"
            checked={model.acknowledged}
            onChange={(event) => model.setAcknowledged(event.target.checked)}
          />
          {outline.pageCount !== undefined
            ? "I checked the pages and want to include any pages shared by more than one chapter."
            : "I checked the sections and want to include them in full, even if chapters share a section."}
        </label>
        <details>
          <summary>
            Preview {chapterCount(model.plans.length)} and{" "}
            {model.plans.length === 1 ? "its citation" : "their citations"}
          </summary>
          {model.plans.length ? (
            model.plans.map((plan) => (
              <ChapterPreview key={plan.sourceId} plan={plan} outline={outline} />
            ))
          ) : (
            <p>Select a chapter to preview it.</p>
          )}
        </details>
      </fieldset>
    </>
  );
}

function ChapterChoiceFields({
  choice,
  index,
  outline,
  update,
}: {
  readonly choice: ChapterChoice;
  readonly index: number;
  readonly outline: ChapterOutline;
  readonly update: (patch: Partial<ChapterChoice>) => void;
}): JSX.Element {
  return (
    <div className="chapter-choice" style={{ paddingInlineStart: Math.min(choice.level, 6) * 16 }}>
      <label>
        <input
          type="checkbox"
          checked={choice.picked}
          onChange={(event) => update({ picked: event.target.checked })}
        />
        Entry {String(index + 1)}: {choice.title || "Untitled chapter"}
      </label>
      <label>
        Chapter title
        <input value={choice.title} onChange={(event) => update({ title: event.target.value })} />
      </label>
      <ChapterRangeEditor
        choice={choice}
        outline={outline}
        onChange={(range) => update({ range, problem: "" })}
      />
      {choice.problem ? (
        <p id={`${choice.key}-range-problem`} role="alert">
          {choice.problem}
        </p>
      ) : null}
      {choice.warning ? <p>{choice.warning}</p> : null}
      {choice.picked ? (
        <>
          <label>
            Chapter authors (separate with semicolons)
            <input
              value={choice.authors}
              onChange={(event) => update({ authors: event.target.value })}
            />
          </label>
          <label>
            Printed page labels (optional, e.g. 41–67)
            <input
              value={choice.printed}
              onChange={(event) => update({ printed: event.target.value })}
            />
          </label>
        </>
      ) : null}
    </div>
  );
}

function ChapterRangeEditor({
  choice,
  outline,
  onChange,
}: {
  readonly choice: ChapterChoice;
  readonly outline: ChapterOutline;
  readonly onChange: (range: DocumentRange) => void;
}): JSX.Element {
  const range = choice.range;
  return (
    <div className="chapter-boundaries">
      {(["start", "end"] as const).map((endpoint) =>
        outline.pageCount !== undefined ? (
          <label key={endpoint}>
            {endpoint === "start" ? "Start page" : "End page"}
            <input
              type="number"
              min={1}
              max={outline.pageCount}
              step={1}
              aria-invalid={Boolean(choice.problem)}
              aria-describedby={choice.problem ? `${choice.key}-range-problem` : undefined}
              value={
                range?.kind === "pages" && Number.isFinite(range[endpoint])
                  ? range[endpoint] + 1
                  : ""
              }
              onChange={(event) =>
                onChange({
                  ...(range?.kind === "pages" ? range : { kind: "pages", start: NaN, end: NaN }),
                  [endpoint]: event.target.valueAsNumber - 1,
                })
              }
            />
            <small>of {String(outline.pageCount)} pages</small>
          </label>
        ) : (
          <label key={endpoint}>
            {endpoint === "start" ? "Start section" : "End section"}
            <select
              value={range?.kind === "epub-spine" ? range[endpoint] : ""}
              onChange={(event) =>
                onChange({
                  kind: "epub-spine",
                  start: range?.kind === "epub-spine" ? range.start : "",
                  end: range?.kind === "epub-spine" ? range.end : "",
                  [endpoint]: event.target.value,
                })
              }
            >
              <option value="">Choose a section</option>
              {outline.spine?.map((href, index) => (
                <option key={href} value={href} title={href}>
                  {String(index + 1)}.{" "}
                  {outline.proposals.find(
                    (proposal) =>
                      proposal.range?.kind === "epub-spine" && proposal.range.start === href,
                  )?.title ?? `Section ${String(index + 1)}`}
                </option>
              ))}
            </select>
          </label>
        ),
      )}
    </div>
  );
}
