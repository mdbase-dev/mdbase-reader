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

import { citationDecorations } from "./citation-widgets.js";
import {
  citationCompletionAt,
  wikiLinkCompletionAt,
  type CitationCompletionCandidate,
  type WikiLinkCandidate,
} from "./completions.js";

import type { Extension, Range } from "@codemirror/state";

export function annotationEditorExtensions(
  candidates: readonly WikiLinkCandidate[],
  citations: readonly CitationCompletionCandidate[],
  onOpen: ((path: string) => void) | undefined,
  onEdit: ((path: string) => void) | undefined,
  onOpenCitation: ((id: string) => void) | undefined,
  onEditCitation: ((id: string) => void) | undefined,
): readonly Extension[] {
  return [
    referenceCompletions(candidates, citations),
    annotationEmbeds(candidates, onOpen, onEdit),
    citationDecorations(citations, onOpenCitation, onEditCitation),
  ];
}

function referenceCompletions(
  candidates: readonly WikiLinkCandidate[],
  citations: readonly CitationCompletionCandidate[],
): Extension {
  return autocompletion({
    activateOnTyping: true,
    maxRenderedOptions: 8,
    optionClass: (completion) =>
      completion.type === "annotation" ? "cm-completion-annotation" : "",
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
      detail: candidate.label,
      ...(candidate.detail ? { info: candidate.detail } : {}),
      type: "citation",
      apply: `[@${candidate.id}]`,
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
  onEdit: ((path: string) => void) | undefined,
): Extension {
  const byPath = new Map(candidates.map((candidate) => [candidate.path, candidate]));
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = embeddedDecorations(view, byPath, onOpen, onEdit);
      }

      update(update: ViewUpdate): void {
        if (update.docChanged || update.viewportChanged || update.selectionSet) {
          this.decorations = embeddedDecorations(update.view, byPath, onOpen, onEdit);
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
  onEdit: ((path: string) => void) | undefined,
): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const expression = /(!?)\[\[([^\]]+)\]\]/gu;
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    for (const match of text.matchAll(expression)) {
      const rawPath = match[2];
      if (rawPath === undefined) {
        continue;
      }
      const path = rawPath.split(/[|#]/u, 1)[0] ?? rawPath;
      const candidate = candidates.get(path);
      const start = from + match.index;
      const end = start + match[0].length;
      const cursor = view.state.selection.main.head;
      const editing = cursor >= start && cursor <= end;
      if (match[1] === "!" && candidate?.embed && !editing) {
        ranges.push(
          Decoration.replace({
            widget: new AnnotationEmbedWidget(candidate, onOpen, onEdit, start),
          }).range(start, end),
        );
      } else {
        ranges.push(
          Decoration.mark({
            class: candidate ? "cm-wikilink is-resolved" : "cm-wikilink is-unresolved",
            attributes: candidate
              ? { title: candidate.label }
              : { title: `Linked record not found: ${path}` },
          }).range(start, end),
        );
      }
    }
  }
  return Decoration.set(ranges, true);
}

class AnnotationEmbedWidget extends WidgetType {
  constructor(
    readonly candidate: WikiLinkCandidate,
    readonly onOpen: ((path: string) => void) | undefined,
    readonly onEdit: ((path: string) => void) | undefined,
    readonly start: number,
  ) {
    super();
  }

  override eq(other: AnnotationEmbedWidget): boolean {
    return other.candidate === this.candidate && other.start === this.start;
  }

  override toDOM(view: EditorView): HTMLElement {
    const card = document.createElement("aside");
    card.className = "cm-annotation-embed";
    card.setAttribute("aria-label", `Embedded annotation: ${this.candidate.label}`);
    card.append(this.header(), ...this.content(), this.footer(view));
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

  private footer(view: EditorView): HTMLElement {
    const footer = document.createElement("footer");
    const path = document.createElement("code");
    path.textContent = `![[${this.candidate.path}]]`;
    footer.append(path);
    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "Edit link";
    edit.addEventListener("mousedown", (event) => event.preventDefault());
    edit.addEventListener("click", () => {
      view.dispatch({ selection: { anchor: this.start + 3 }, scrollIntoView: true });
      view.focus();
    });
    footer.append(edit);
    if (this.onEdit) {
      const editAnnotation = document.createElement("button");
      editAnnotation.type = "button";
      editAnnotation.textContent = "Edit highlight";
      editAnnotation.addEventListener("mousedown", (event) => event.preventDefault());
      editAnnotation.addEventListener("click", () => this.onEdit?.(this.candidate.path));
      footer.append(editAnnotation);
    }
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
