import {
  autocompletion,
  insertCompletionText,
  pickedCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";

import {
  citationCompletionAt,
  citationReplacement,
  wikiLinkCompletionAt,
  wikiLinkReplacement,
  type CitationCompletionCandidate,
  type CompletionReplacement,
  type WikiLinkCandidate,
} from "./completions.js";

import type { Extension } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

export function referenceCompletions(
  candidates: readonly WikiLinkCandidate[],
  citations: readonly CitationCompletionCandidate[],
): Extension {
  return autocompletion({
    activateOnTyping: true,
    maxRenderedOptions: 8,
    override: [
      (context) => annotationCompletionSource(context, candidates),
      (context) => citationCompletionSource(context, citations),
    ],
  });
}

function citationCompletionSource(
  context: CompletionContext,
  candidates: readonly CitationCompletionCandidate[],
): CompletionResult | null {
  const completion = citationCompletionAt(context.state.doc.toString(), context.pos, candidates);
  if (!completion) {
    return null;
  }
  return {
    from: completion.from,
    filter: false,
    options: completion.options.map((candidate) => ({
      label: candidate.id,
      detail: candidate.display ? `${candidate.display} · ${candidate.label}` : candidate.label,
      ...(candidate.detail ? { info: candidate.detail } : {}),
      type: "citation",
      apply: applyReplacement((document, from, to) =>
        citationReplacement(document, from, to, candidate.id),
      ),
    })),
  };
}

function annotationCompletionSource(
  context: CompletionContext,
  candidates: readonly WikiLinkCandidate[],
): CompletionResult | null {
  const completion = wikiLinkCompletionAt(context.state.doc.toString(), context.pos, candidates);
  if (!completion) {
    return null;
  }
  return {
    from: completion.from,
    filter: false,
    options: completion.options.map((candidate) => {
      const detail = [candidate.kind, candidate.detail].filter(Boolean).join(" · ");
      return {
        label: candidate.label,
        ...(detail ? { detail } : {}),
        ...(hasPreview(candidate) ? { info: () => wikiLinkInfo(candidate) } : {}),
        type: candidate.embed ? "annotation" : "source",
        boost: candidate.embed ? 20 : 0,
        apply: applyReplacement((document, from, to) =>
          wikiLinkReplacement(document, from, to, candidate.path),
        ),
      };
    }),
  };
}

function applyReplacement(
  replacement: (document: string, from: number, to: number) => CompletionReplacement,
): (view: EditorView, completion: Completion, from: number, to: number) => void {
  return (view, completion, from, to) => {
    const edit = replacement(view.state.doc.toString(), from, to);
    view.dispatch({
      ...insertCompletionText(view.state, edit.insert, edit.from, edit.to),
      annotations: pickedCompletion.of(completion),
    });
  };
}

/** The label already shows a short note in full, so only longer text earns a preview. */
function hasPreview(candidate: WikiLinkCandidate): boolean {
  return Boolean(candidate.quote) || (candidate.note ?? candidate.label) !== candidate.label;
}

function wikiLinkInfo(candidate: WikiLinkCandidate): HTMLElement {
  const info = document.createElement("div");
  info.className = "cm-completion-preview";
  if (candidate.quote) {
    const quote = document.createElement("blockquote");
    quote.textContent = candidate.quote;
    info.append(quote);
  }
  if (candidate.note && candidate.note !== candidate.quote) {
    const note = document.createElement("p");
    note.textContent = candidate.note;
    info.append(note);
  }
  return info;
}
