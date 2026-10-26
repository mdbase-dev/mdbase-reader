import { t as translate } from "@lingui/core/macro";
import { useEffect, useRef, useState } from "react";

import {
  readChapterOutline,
  validateChapterRange,
  type ChapterOutline,
} from "./chapter-outline.js";
import { readerErrorMessage } from "./errors.js";
import { chapterPlan, confirmChapterPlans, type ChapterProposal } from "./source-part-creation.js";

import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type {
  DocumentDescriptor,
  PlannedSourcePart,
  Source,
  SourceSummary,
} from "@mdbase-reader/core";
import type { Claim } from "@mdbase-reader/web-capture/citation-updates";

export interface ChapterChoice extends ChapterProposal {
  readonly picked: boolean;
  readonly authors: string;
  readonly printed: string;
}

function choiceClaims(choice: ChapterChoice): readonly Claim[] {
  const observedAt = new Date().toISOString();
  return [
    ...(choice.authors.trim()
      ? [
          {
            field: "author",
            value: choice.authors
              .split(";")
              .map((name) => ({ literal: name.trim() }))
              .filter(({ literal }) => literal),
            source: { kind: "user" as const },
            observedAt,
          },
        ]
      : []),
    ...(choice.printed.trim()
      ? [
          {
            field: "page",
            value: choice.printed.trim(),
            source: { kind: "user" as const },
            observedAt,
          },
        ]
      : []),
  ];
}

interface ChapterRead {
  readonly parent: Source;
  readonly document: DocumentDescriptor;
  readonly outline: ChapterOutline;
}
interface ChapterCreationModel {
  readonly outline: ChapterOutline | undefined;
  readonly choices: readonly ChapterChoice[];
  readonly plans: readonly PlannedSourcePart[];
  readonly busy: boolean;
  readonly problem: string | null;
  readonly acknowledged: boolean;
  readonly setAcknowledged: (value: boolean) => void;
  readonly completed: number;
  readonly update: (key: string, patch: Partial<ChapterChoice>) => void;
  readonly addManual: () => void;
  readonly confirm: () => Promise<void>;
}

function useChapterOutline(
  gateway: ReaderWorkspaceGateway,
  book: SourceSummary,
): { readonly result: ChapterRead | null; readonly error: string | null } {
  const [result, setResult] = useState<{
    parent: Source;
    document: DocumentDescriptor;
    outline: ChapterOutline;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const parent = await (gateway.refreshSource ?? gateway.source).call(gateway, book.id, {
        signal: controller.signal,
      });
      if (!parent) {
        throw new Error(translate({ message: "The book is no longer available." }));
      }
      const document = parent.documents.find(
        (entry) =>
          entry.role === "primary" &&
          ["application/pdf", "application/epub+zip"].includes(entry.mediaType),
      );
      if (!document) {
        throw new Error(translate({ message: "Attach a PDF or EPUB to the book first." }));
      }
      const outline = await readChapterOutline(gateway, document, controller.signal);
      if (!controller.signal.aborted) {
        setResult({ parent, document, outline });
      }
    })().catch((reason: unknown) => {
      if (!controller.signal.aborted) {
        setError(
          readerErrorMessage(reason, translate({ message: "Could not read the book outline." })),
        );
      }
    });
    return () => controller.abort();
  }, [gateway, book.id]);
  return { result, error };
}

function manualChoice(outline: ChapterOutline): ChapterChoice {
  return {
    key: crypto.randomUUID(),
    title: "",
    level: 0,
    picked: true,
    authors: "",
    printed: "",
    range:
      outline.pageCount !== undefined
        ? { kind: "pages", start: NaN, end: NaN }
        : { kind: "epub-spine", start: outline.spine?.[0] ?? "", end: outline.spine?.[0] ?? "" },
  };
}

function updatedChoice(
  choice: ChapterChoice,
  patch: Partial<ChapterChoice>,
  outline: ChapterOutline,
): ChapterChoice {
  const updated = { ...choice, ...patch };
  if (patch.range) {
    // Wait for both pages before judging; confirming still validates every choice.
    if (
      patch.range.kind === "pages" &&
      (Number.isNaN(patch.range.start) || Number.isNaN(patch.range.end))
    ) {
      return { ...updated, problem: "" };
    }
    try {
      validateChapterRange(patch.range, outline);
      return { ...updated, problem: "" };
    } catch (reason) {
      return {
        ...updated,
        problem: readerErrorMessage(
          reason,
          translate({ message: "Check the chapter’s pages or sections." }),
        ),
      };
    }
  }
  return updated;
}

/** Range problems shown beside their chapters, or null when every selected range is valid. */
function withRangeProblems(
  choices: readonly ChapterChoice[],
  selected: readonly ChapterChoice[],
  outline: ChapterOutline,
): readonly ChapterChoice[] | null {
  const problems = new Map<string, string>();
  for (const choice of selected) {
    try {
      validateChapterRange(choice.range, outline);
    } catch (reason) {
      problems.set(
        choice.key,
        readerErrorMessage(
          reason,
          translate({ message: "Check the chapter’s pages or sections." }),
        ),
      );
    }
  }
  return problems.size
    ? choices.map((choice) => {
        const problem = problems.get(choice.key);
        return problem ? { ...choice, problem } : choice;
      })
    : null;
}

export function useChapterCreation(
  gateway: ReaderWorkspaceGateway,
  book: SourceSummary,
  onCreated: (source: Source) => void,
  onClose: () => void,
): ChapterCreationModel {
  const { result, error } = useChapterOutline(gateway, book);
  const [draft, setDraft] = useState<{
    outline: ChapterOutline;
    choices: readonly ChapterChoice[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [completed, setCompleted] = useState<ReadonlySet<string>>(() => new Set());
  const pending = useRef(false);
  if (result && draft?.outline !== result.outline) {
    setDraft({
      outline: result.outline,
      choices: result.outline.proposals.map((proposal) => ({
        ...proposal,
        picked: false,
        authors: "",
        printed: "",
      })),
    });
  }
  const choices = draft?.choices ?? [];
  const selected = choices.filter(({ picked }) => picked);
  const plans = result
    ? selected.map((choice) =>
        chapterPlan(result.parent, choice, result.document, choiceClaims(choice)),
      )
    : [];
  const update = (key: string, patch: Partial<ChapterChoice>): void => {
    setDraft((previous) =>
      previous
        ? {
            ...previous,
            choices: previous.choices.map((choice) =>
              choice.key === key ? updatedChoice(choice, patch, previous.outline) : choice,
            ),
          }
        : previous,
    );
    setAcknowledged(false);
    setProblem(null);
  };
  const addManual = (): void => {
    if (!result) {
      return;
    }
    const outline = result.outline;
    setDraft((previous) =>
      previous
        ? {
            ...previous,
            choices: [...previous.choices, manualChoice(outline)],
          }
        : previous,
    );
    setAcknowledged(false);
  };
  const confirm = async (): Promise<void> => {
    if (!result || !plans.length || pending.current) {
      return;
    }
    const flagged = withRangeProblems(choices, selected, result.outline);
    if (flagged) {
      setDraft((previous) => (previous ? { ...previous, choices: flagged } : previous));
      return;
    }
    pending.current = true;
    setBusy(true);
    setProblem(null);
    try {
      for (const choice of selected) {
        validateChapterRange(choice.range, result.outline);
      }
      if (selected.some(({ warning }) => warning) && !acknowledged) {
        throw new Error(
          translate({
            message: "Check where the chapters start and end, then tick the confirmation box.",
          }),
        );
      }
      await confirmChapterPlans(
        gateway,
        plans,
        acknowledged,
        (source) => {
          onCreated(source);
          setCompleted((previous) => new Set([...previous, source.id]));
        },
        result.outline.spine,
      );
      onClose();
    } catch (reason) {
      setProblem(readerErrorMessage(reason, translate({ message: "Chapter creation failed." })));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return {
    outline: result?.outline,
    choices,
    plans,
    busy,
    problem: problem ?? error,
    acknowledged,
    setAcknowledged,
    completed: completed.size,
    update,
    addManual,
    confirm,
  };
}
