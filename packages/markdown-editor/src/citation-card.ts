import { closeHoverTooltips, type EditorView } from "@codemirror/view";

import type { CitationGroup } from "./citation-widgets.js";
import type { CitationCompletionCandidate } from "./completions.js";

/** What the hover card needs from a rendered citation. */
export interface CitableWidget {
  readonly group: CitationGroup;
  readonly candidates: readonly CitationCompletionCandidate[];
  readonly select: (view: EditorView) => void;
}

export function citationCard(
  view: EditorView,
  widget: CitableWidget,
  onOpen: ((id: string) => void) | undefined,
  onEditMetadata: ((id: string) => void) | undefined,
): HTMLElement {
  const dismissing = (action: () => void) => (): void => {
    view.dispatch({ effects: closeHoverTooltips });
    action();
  };
  const card = document.createElement("div");
  card.className = "cm-citation-card";
  for (const candidate of widget.candidates) {
    const entry = document.createElement("section");
    const heading = document.createElement("strong");
    heading.textContent = citationLabel(candidate);
    const title = document.createElement("p");
    title.textContent = candidate.label;
    entry.append(heading, title);
    if (candidate.detail && candidate.detail !== heading.textContent) {
      const detail = document.createElement("small");
      detail.textContent = candidate.detail;
      entry.append(detail);
    }
    const actions = document.createElement("div");
    actions.className = "cm-citation-actions";
    if (onOpen) {
      actions.append(
        citationAction(
          "Open source",
          dismissing(() => onOpen(candidate.id)),
        ),
      );
    }
    if (onEditMetadata) {
      actions.append(
        citationAction(
          "Edit metadata",
          dismissing(() => onEditMetadata(candidate.id)),
        ),
      );
    }
    if (actions.childElementCount > 0) {
      entry.append(actions);
    }
    card.append(entry);
  }
  const footer = document.createElement("footer");
  const syntax = document.createElement("code");
  syntax.textContent = widget.group.raw;
  footer.append(
    syntax,
    citationAction("Edit citation", () => widget.select(view)),
  );
  card.append(footer);
  return card;
}

export function citationLabel(candidate: CitationCompletionCandidate): string {
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
