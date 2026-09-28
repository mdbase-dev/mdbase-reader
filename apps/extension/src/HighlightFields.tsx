import { useEffect, useRef, useState } from "react";

import { highlightColors, type CaptureDraft } from "./save-capture.js";
import { TagInput } from "./TagInput.js";

import type { ExtensionCaptureController } from "./capture-controller.js";

/**
 * The selected passage and how to save it; follows the page selection live. Top to bottom
 * in the order they are used: an optional comment and tags, then a colour, which saves.
 */
export function HighlightFields({
  controller: c,
  ready,
}: {
  readonly controller: ExtensionCaptureController;
  /** Whether a save may start now (connected, titled, not busy). */
  readonly ready: boolean;
}): React.JSX.Element | null {
  const comment = useRef<HTMLTextAreaElement>(null);
  const [openDetails, setOpenDetails] = useState(false);
  const selection = c.capture?.kind === "html" ? c.capture.selection : null;
  const intent = c.invocation;
  const { save, clearSelection } = c;
  useEffect(() => {
    if (intent?.intent === "note" || openDetails) {
      comment.current?.focus();
    }
  }, [intent, openDetails]);
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
  if (!selection) {
    return null;
  }
  const update = (changes: Partial<CaptureDraft>): void =>
    c.setDraft((draft) => ({ ...draft, ...changes }));
  // Most highlights need neither; the fields stay open once they hold anything.
  const detailsOpen =
    openDetails || intent?.intent === "note" || Boolean(c.draft.comment || c.draft.highlightTags);
  return (
    <section aria-label="Selected passage" className="highlight-fields">
      <blockquote>{selection.exact}</blockquote>
      {detailsOpen ? (
        <>
          <label htmlFor="comment">
            Comment <span>(optional)</span>
          </label>
          <textarea
            className="mdbase-field"
            id="comment"
            ref={comment}
            value={c.draft.comment}
            rows={2}
            onChange={(event) => update({ comment: event.target.value })}
          />
          <label htmlFor="highlight-tags">
            Tags <span>(comma-separated, optional)</span>
          </label>
          <TagInput
            id="highlight-tags"
            value={c.draft.highlightTags}
            known={c.knownTags}
            onFocus={c.loadTags}
            onChange={(highlightTags) => update({ highlightTags })}
          />
        </>
      ) : (
        <button type="button" className="text-button" onClick={() => setOpenDetails(true)}>
          Add a comment or tags
        </button>
      )}
      <div className="passage-actions">
        <span className="field-label" id="highlight-colors">
          {c.source ? "Save highlight" : "Save page and highlight"}
        </span>
        <button
          type="button"
          className="text-button"
          aria-keyshortcuts="Escape"
          title="Clear the selection (Esc)"
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
          </button>
        ))}
      </div>
    </section>
  );
}
