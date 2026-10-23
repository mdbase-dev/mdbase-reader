import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type JSX,
  type ReactNode,
} from "react";

import { useChapterCreation, type ChapterChoice } from "./use-chapter-creation.js";
import "./source-parts-library.css";

import type { ChapterOutline } from "./chapter-outline.js";
import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type { DocumentRange, Source, SourceSummary } from "@mdbase-reader/core";

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
        onSubmit={(event) => {
          event.preventDefault();
          void model.confirm();
        }}
      >
        <h2 id="chapter-create-title">Add chapters as sources</h2>
        <p>In {book.title}. Chapters share the existing file; no files or annotations are moved.</p>
        {!model.outline && !model.problem ? (
          <p role="status">Reading this exact document’s outline…</p>
        ) : null}
        {model.outline ? <ChapterChecklist model={model} outline={model.outline} /> : null}
        {model.problem ? <p role="alert">{model.problem}</p> : null}
        <p role="status">
          {model.completed
            ? `${String(model.completed)} chapters completed; retries reuse the reviewed identities.`
            : `${String(model.plans.length)} chapters selected. Nothing is created until confirmation.`}
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
        {outline.pageCount
          ? `${String(outline.pageCount)} file pages. Indexes below are zero-based and inclusive; printed pagination is separate.`
          : "Select whole EPUB spine resources. Fragment TOC boundaries need review; no CFIs are invented."}
      </p>
      <fieldset disabled={model.busy || model.completed > 0}>
        <legend>Choose chapters and review boundaries</legend>
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
          Add a chapter manually by range
        </button>
        <label>
          <input
            type="checkbox"
            checked={model.acknowledged}
            onChange={(event) => model.setAcknowledged(event.target.checked)}
          />
          I reviewed the boundaries and acknowledge any overlapping or whole-resource ranges.
        </label>
        <details>
          <summary>Preview {String(model.plans.length)} chapter records and citations</summary>
          {model.plans.map((plan) => (
            <pre key={plan.sourceId}>
              {JSON.stringify(
                {
                  title: plan.title,
                  parent: plan.parent.title,
                  document: plan.document,
                  csl: plan.citation,
                },
                null,
                2,
              )}
            </pre>
          ))}
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
      {choice.problem ? <p>{choice.problem}</p> : null}
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
        outline.pageCount ? (
          <label key={endpoint}>
            {endpoint === "start" ? "Start" : "End"} file-page index
            <input
              type="number"
              min={0}
              max={outline.pageCount - 1}
              value={range?.kind === "pages" ? range[endpoint] : ""}
              onChange={(event) =>
                onChange({
                  kind: "pages",
                  start: range?.kind === "pages" ? range.start : 0,
                  end: range?.kind === "pages" ? range.end : 0,
                  [endpoint]: event.target.value === "" ? NaN : Number(event.target.value),
                })
              }
            />
          </label>
        ) : (
          <label key={endpoint}>
            {endpoint === "start" ? "Start" : "End"} spine resource
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
              <option value="">Choose a spine resource</option>
              {outline.spine?.map((href) => (
                <option key={href} value={href}>
                  {href}
                </option>
              ))}
            </select>
          </label>
        ),
      )}
    </div>
  );
}
