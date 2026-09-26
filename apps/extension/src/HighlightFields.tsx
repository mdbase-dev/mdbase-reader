import { useEffect, useRef } from "react";

import { highlightColors, type CaptureDraft } from "./save-capture.js";
import { TagInput } from "./TagInput.js";

import type { ExtensionCaptureController } from "./capture-controller.js";

/**
 * The selected passage and how to save it; follows the page selection live. Choosing a
 * colour saves at once, with any comment and tags typed first.
 */
export function HighlightFields({
  controller: c,
  ready,
}: {
  readonly controller: ExtensionCaptureController;
  /** Whether a save may start now (connected, titled, not busy). */
  readonly ready: boolean;
}): React.JSX.Element {
  const comment = useRef<HTMLTextAreaElement>(null);
  const selection = c.capture?.kind === "html" ? c.capture.selection : null;
  const intent = c.invocation;
  const { save, clearSelection } = c;
  useEffect(() => {
    if (intent?.intent === "note") {
      comment.current?.focus();
    }
  }, [intent]);
  useEffect(() => {
    if (!selection) {
      return;
    }
    // 1–5 save in that colour and Esc lets the passage go, unless the reader is typing.
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }
      if (
        event.target instanceof Element &&
        event.target.closest("input, textarea, select, [contenteditable], [role='combobox']")
      ) {
        return;
      }
      const color = highlightColors[Number(event.key) - 1];
      if (color && ready) {
        event.preventDefault();
        void save({ highlight: true, color });
      } else if (event.key === "Escape") {
        event.preventDefault();
        clearSelection();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [clearSelection, ready, save, selection]);
  if (c.capture?.kind === "pdf") {
    return (
      <p className="hint">
        Chrome’s PDF viewer does not share selections, so PDFs are highlighted in Reader. Save the
        PDF, then open it there.
      </p>
    );
  }
  if (!selection) {
    return (
      <p className="hint">
        Select text on the page to highlight it. Each new selection appears here; this panel stays
        open while you read.
      </p>
    );
  }
  const update = (changes: Partial<CaptureDraft>): void =>
    c.setDraft((draft) => ({ ...draft, ...changes }));
  return (
    <section aria-label="Selected passage" className="highlight-fields">
      <blockquote>{selection.exact}</blockquote>
      <div className="passage-actions">
        <span className="field-label" id="highlight-colors">
          {c.source ? "Save highlight" : "Save page and highlight"}
        </span>
        <button
          type="button"
          className="text-button"
          aria-keyshortcuts="Escape"
          onClick={c.clearSelection}
        >
          Clear
        </button>
      </div>
      <div className="colors" role="group" aria-labelledby="highlight-colors">
        {highlightColors.map((color, index) => (
          <button
            key={color}
            type="button"
            className={`swatch swatch-${color}`}
            aria-pressed={c.draft.color === color}
            aria-keyshortcuts={String(index + 1)}
            title={`Save in ${color} (${String(index + 1)})`}
            disabled={!ready}
            onClick={() => void c.save({ highlight: true, color })}
          >
            {color}
            <kbd>{index + 1}</kbd>
          </button>
        ))}
      </div>
      <label htmlFor="comment">
        Comment <span>(optional, before choosing a colour)</span>
      </label>
      <textarea
        id="comment"
        ref={comment}
        value={c.draft.comment}
        rows={2}
        onChange={(event) => update({ comment: event.target.value })}
      />
      <label htmlFor="highlight-tags">
        Highlight tags <span>(comma-separated, optional)</span>
      </label>
      <TagInput
        id="highlight-tags"
        value={c.draft.highlightTags}
        known={c.knownTags}
        onFocus={c.loadTags}
        onChange={(highlightTags) => update({ highlightTags })}
      />
    </section>
  );
}
