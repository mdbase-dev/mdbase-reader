import { plural, t as translate } from "@lingui/core/macro";
import { useLingui as useLocale } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
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
  return plural(count, { one: "# chapter", other: "# chapters" });
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
  useLocale();
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
        <h2 id="chapter-create-title">
          <Trans>Add chapters as sources</Trans>
        </h2>
        <p>{translate`In ${book.title}. Chapters share the existing file; no files or annotations are moved.`}</p>
        {!model.outline && !model.problem ? (
          <p role="status">
            <Trans>Reading the table of contents…</Trans>
          </p>
        ) : null}
        {model.outline ? <ChapterChecklist model={model} outline={model.outline} /> : null}
        {model.problem ? <p role="alert">{model.problem}</p> : null}
        <p role="status">
          {model.completed
            ? translate`${chapterCount(model.completed)} created. You can retry without creating duplicates.`
            : translate`${chapterCount(model.plans.length)} selected. Nothing is created until you confirm.`}
        </p>
        <div className="source-parts-actions">
          <button className="mdbase-button" type="button" disabled={model.busy} onClick={onClose}>
            <Trans context="Reader interface">Cancel</Trans>
          </button>
          <button
            className="mdbase-button"
            type="submit"
            disabled={model.busy || !model.plans.length}
          >
            {model.busy
              ? translate({ message: "Creating…" })
              : translate({ message: "Create chapters" })}
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
  useLocale();
  return (
    <>
      <p>
        {outline.pageCount !== undefined
          ? translate`Use the page numbers in the PDF viewer, from 1 to ${String(outline.pageCount)}. Both the start and end pages are included. Printed page labels can be added separately.`
          : translate({
              message:
                "Choose sections in reading order. The first and last sections are included in full.",
            })}
      </p>
      <fieldset disabled={model.busy || model.completed > 0}>
        <legend>
          <Trans>Choose chapters and check where they start and end</Trans>
        </legend>
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
          <Trans>Add a chapter manually</Trans>
        </button>
        <label>
          <input
            type="checkbox"
            checked={model.acknowledged}
            onChange={(event) => model.setAcknowledged(event.target.checked)}
          />
          {outline.pageCount !== undefined
            ? translate({
                message:
                  "I checked the pages and want to include any pages shared by more than one chapter.",
              })
            : translate({
                message:
                  "I checked the sections and want to include them in full, even if chapters share a section.",
              })}
        </label>
        <details>
          <summary>
            <Trans>Preview </Trans>
            {chapterCount(model.plans.length)} <Trans>and</Trans>{" "}
            {model.plans.length === 1
              ? translate({ message: "its citation" })
              : translate({ message: "their citations" })}
          </summary>
          {model.plans.length ? (
            model.plans.map((plan) => (
              <ChapterPreview key={plan.sourceId} plan={plan} outline={outline} />
            ))
          ) : (
            <p>
              <Trans>Select a chapter to preview it.</Trans>
            </p>
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
  useLocale();
  return (
    <div className="chapter-choice" style={{ paddingInlineStart: Math.min(choice.level, 6) * 16 }}>
      <label>
        <input
          type="checkbox"
          checked={choice.picked}
          onChange={(event) => update({ picked: event.target.checked })}
        />
        <Trans>Entry </Trans>
        {String(index + 1)}: {choice.title || translate({ message: "Untitled chapter" })}
      </label>
      <label>
        <Trans>Chapter title</Trans>
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
            <Trans>Chapter authors (separate with semicolons)</Trans>
            <input
              value={choice.authors}
              onChange={(event) => update({ authors: event.target.value })}
            />
          </label>
          <label>
            <Trans>Printed page labels (optional, e.g. 41–67)</Trans>
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
  useLocale();
  const range = choice.range;
  return (
    <div className="chapter-boundaries">
      {(["start", "end"] as const).map((endpoint) =>
        outline.pageCount !== undefined ? (
          <label key={endpoint}>
            {endpoint === "start"
              ? translate({ message: "Start page" })
              : translate({ message: "End page" })}
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
            <small>
              <Trans>of </Trans>
              {String(outline.pageCount)} <Trans>pages</Trans>
            </small>
          </label>
        ) : (
          <label key={endpoint}>
            {endpoint === "start"
              ? translate({ message: "Start section" })
              : translate({ message: "End section" })}
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
              <option value="">
                <Trans>Choose a section</Trans>
              </option>
              {outline.spine?.map((href, index) => (
                <option key={href} value={href} title={href}>
                  {String(index + 1)}.{" "}
                  {outline.proposals.find(
                    (proposal) =>
                      proposal.range?.kind === "epub-spine" && proposal.range.start === href,
                  )?.title ?? translate`Section ${String(index + 1)}`}
                </option>
              ))}
            </select>
          </label>
        ),
      )}
    </div>
  );
}
