import {
  Decoration,
  type DecorationSet,
  type EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";

import type { CitationCompletionCandidate } from "./completions.js";
import type { Extension, Range } from "@codemirror/state";

export interface CitationReference {
  readonly id: string;
  readonly from: number;
  readonly to: number;
}

export interface CitationGroup {
  readonly from: number;
  readonly to: number;
  readonly raw: string;
  readonly references: readonly CitationReference[];
}

const groupExpression = /(?<!\[)\[(?!\[)([^\]\n]*@[^\]\n]+)\](?!\])/gu;
const referenceExpression = /(?:^|[\s;])@([A-Za-z0-9][\w:./-]*)/gu;

export function citationGroups(document: string): readonly CitationGroup[] {
  const groups: CitationGroup[] = [];
  for (const match of document.matchAll(groupExpression)) {
    const inner = match[1];
    if (inner === undefined) {
      continue;
    }
    const start = match.index;
    const references = [...inner.matchAll(referenceExpression)].flatMap((reference) => {
      const id = reference[1];
      const at = reference[0].lastIndexOf("@");
      return id
        ? [
            {
              id,
              from: start + 1 + reference.index + at,
              to: start + 2 + reference.index + at + id.length,
            },
          ]
        : [];
    });
    if (references.length > 0) {
      groups.push({ from: start, to: start + match[0].length, raw: match[0], references });
    }
  }
  return groups;
}

export function citationDecorations(
  candidates: readonly CitationCompletionCandidate[],
  onOpen: ((id: string) => void) | undefined,
  onEditMetadata: ((id: string) => void) | undefined,
): Extension {
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = decoratedCitations(view, byId, onOpen, onEditMetadata);
      }

      update(update: ViewUpdate): void {
        if (update.docChanged || update.viewportChanged || update.selectionSet) {
          this.decorations = decoratedCitations(update.view, byId, onOpen, onEditMetadata);
        }
      }
    },
    { decorations: (value) => value.decorations },
  );
}

function decoratedCitations(
  view: EditorView,
  candidates: ReadonlyMap<string, CitationCompletionCandidate>,
  onOpen: ((id: string) => void) | undefined,
  onEditMetadata: ((id: string) => void) | undefined,
): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  for (const group of citationGroups(view.state.doc.toString())) {
    if (!visible(view, group) || selected(view, group)) {
      if (visible(view, group)) {
        ranges.push(citationSyntax(group, candidates));
      }
      continue;
    }
    const resolved = group.references.flatMap(({ id }) => {
      const candidate = candidates.get(id);
      return candidate ? [candidate] : [];
    });
    if (resolved.length !== group.references.length) {
      ranges.push(citationSyntax(group, candidates));
      continue;
    }
    ranges.push(
      Decoration.replace({
        widget: new CitationWidget(group, resolved, onOpen, onEditMetadata),
      }).range(group.from, group.to),
    );
  }
  return Decoration.set(ranges, true);
}

function citationSyntax(
  group: CitationGroup,
  candidates: ReadonlyMap<string, CitationCompletionCandidate>,
): Range<Decoration> {
  const resolved = group.references.every(({ id }) => candidates.has(id));
  return Decoration.mark({
    class: `cm-citation-syntax is-${resolved ? "resolved" : "unresolved"}`,
    attributes: resolved ? { title: "Citation Markdown" } : { title: "Citation not found" },
  }).range(group.from, group.to);
}

function visible(view: EditorView, group: CitationGroup): boolean {
  return view.visibleRanges.some(({ from, to }) => group.to >= from && group.from <= to);
}

function selected(view: EditorView, group: CitationGroup): boolean {
  return view.state.selection.ranges.some(({ from, to }) =>
    from === to ? from >= group.from && from < group.to : to > group.from && from < group.to,
  );
}

class CitationWidget extends WidgetType {
  constructor(
    readonly group: CitationGroup,
    readonly candidates: readonly CitationCompletionCandidate[],
    readonly onOpen: ((id: string) => void) | undefined,
    readonly onEditMetadata: ((id: string) => void) | undefined,
  ) {
    super();
  }

  override eq(other: CitationWidget): boolean {
    return (
      other.group.raw === this.group.raw &&
      other.candidates.length === this.candidates.length &&
      other.candidates.every((item, index) => item === this.candidates[index])
    );
  }

  override toDOM(view: EditorView): HTMLElement {
    const citation = document.createElement("span");
    citation.className = "cm-citation-widget";
    citation.append(this.referenceButton(view));
    const candidate = this.candidates.length === 1 ? this.candidates[0] : undefined;
    if (candidate && (this.onOpen || this.onEditMetadata)) {
      citation.append(this.actions(candidate));
    }
    return citation;
  }

  override ignoreEvent(): boolean {
    return false;
  }

  private referenceButton(view: EditorView): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cm-citation-reference";
    button.textContent = this.candidates.map(citationLabel).join("; ");
    button.title = `${this.candidates.map(({ label }) => label).join("; ")} — click to edit`;
    button.setAttribute("aria-label", `Citation: ${button.textContent}. Edit citation Markdown`);
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => {
      view.dispatch({
        selection: { anchor: this.group.from + 1, head: this.group.to - 1 },
        scrollIntoView: true,
      });
      view.focus();
    });
    return button;
  }

  private actions(candidate: CitationCompletionCandidate): HTMLElement {
    const actions = document.createElement("span");
    actions.className = "cm-citation-actions";
    if (this.onOpen) {
      actions.append(citationAction("Open source", () => this.onOpen?.(candidate.id)));
    }
    if (this.onEditMetadata) {
      actions.append(citationAction("Edit metadata", () => this.onEditMetadata?.(candidate.id)));
    }
    return actions;
  }
}

function citationLabel(candidate: CitationCompletionCandidate): string {
  return candidate.display ?? candidate.detail ?? candidate.label;
}

function citationAction(label: string, action: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("mousedown", (event) => event.preventDefault());
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    action();
  });
  return button;
}
