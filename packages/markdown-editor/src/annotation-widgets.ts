import {
  autocompletion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import {
  Decoration,
  type EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";

import { wikiLinkCompletionAt, type WikiLinkCandidate } from "./completions.js";

import type { Extension, Range } from "@codemirror/state";

export function annotationEditorExtensions(
  candidates: readonly WikiLinkCandidate[],
  onOpen: ((path: string) => void) | undefined,
): readonly Extension[] {
  return [annotationCompletions(candidates), annotationEmbeds(candidates, onOpen)];
}

function annotationCompletions(candidates: readonly WikiLinkCandidate[]): Extension {
  return autocompletion({
    activateOnTyping: true,
    maxRenderedOptions: 8,
    optionClass: (completion) =>
      completion.type === "annotation" ? "cm-completion-annotation" : "",
    override: [(context) => annotationCompletionSource(context, candidates)],
  });
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
    options: completion.options.map((candidate) => ({
      label: candidate.label,
      ...(candidate.detail ? { detail: candidate.detail } : {}),
      ...((candidate.quote ?? candidate.note) ? { info: candidate.quote ?? candidate.note } : {}),
      type: "annotation",
      boost: candidate.embed ? 20 : 0,
      apply: `${candidate.path}]]`,
    })),
  };
}

function annotationEmbeds(
  candidates: readonly WikiLinkCandidate[],
  onOpen: ((path: string) => void) | undefined,
): Extension {
  const byPath = new Map(candidates.map((candidate) => [candidate.path, candidate]));
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = embeddedDecorations(view, byPath, onOpen);
      }

      update(update: ViewUpdate): void {
        if (update.docChanged || update.viewportChanged || update.selectionSet) {
          this.decorations = embeddedDecorations(update.view, byPath, onOpen);
        }
      }
    },
    { decorations: (value) => value.decorations },
  );
}

function embeddedDecorations(
  view: EditorView,
  candidates: ReadonlyMap<string, WikiLinkCandidate>,
  onOpen: ((path: string) => void) | undefined,
): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const expression = /!\[\[([^\]]+)\]\]/gu;
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    for (const match of text.matchAll(expression)) {
      const path = match[1];
      if (path === undefined) {
        continue;
      }
      const candidate = candidates.get(path);
      if (!candidate) {
        continue;
      }
      const start = from + match.index;
      const end = start + match[0].length;
      const cursor = view.state.selection.main.head;
      if (cursor >= start && cursor <= end) {
        continue;
      }
      ranges.push(
        Decoration.replace({
          widget: new AnnotationEmbedWidget(candidate, onOpen),
        }).range(start, end),
      );
    }
  }
  return Decoration.set(ranges, true);
}

class AnnotationEmbedWidget extends WidgetType {
  constructor(
    readonly candidate: WikiLinkCandidate,
    readonly onOpen: ((path: string) => void) | undefined,
  ) {
    super();
  }

  override eq(other: AnnotationEmbedWidget): boolean {
    return other.candidate === this.candidate;
  }

  override toDOM(): HTMLElement {
    const card = document.createElement("aside");
    card.className = "cm-annotation-embed";
    card.setAttribute("aria-label", `Embedded annotation: ${this.candidate.label}`);
    card.append(this.header(), ...this.content(), this.footer());
    return card;
  }

  override ignoreEvent(): boolean {
    return false;
  }

  private header(): HTMLElement {
    const header = document.createElement("header");
    const kind = document.createElement("span");
    kind.textContent = this.candidate.kind ?? "Annotation";
    const detail = document.createElement("small");
    detail.textContent = this.candidate.detail ?? "";
    header.append(kind, detail);
    return header;
  }

  private content(): readonly HTMLElement[] {
    const content: HTMLElement[] = [];
    if (this.candidate.quote) {
      const quote = document.createElement("blockquote");
      quote.textContent = this.candidate.quote;
      content.push(quote);
    }
    if (this.candidate.note) {
      const note = document.createElement("p");
      note.textContent = this.candidate.note;
      content.push(note);
    }
    return content;
  }

  private footer(): HTMLElement {
    const footer = document.createElement("footer");
    const path = document.createElement("code");
    path.textContent = `![[${this.candidate.path}]]`;
    footer.append(path);
    if (this.onOpen) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Open in document";
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", () => this.onOpen?.(this.candidate.path));
      footer.append(button);
    }
    return footer;
  }
}
