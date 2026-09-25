import { useEffect, useRef } from "react";

import { highlightColors, type CaptureDraft } from "./save-capture.js";

import type { ExtensionCaptureController } from "./capture-controller.js";

/** The selected passage and how to save it; follows the page selection live. */
export function HighlightFields({
  controller: c,
}: {
  readonly controller: ExtensionCaptureController;
}): React.JSX.Element {
  const comment = useRef<HTMLTextAreaElement>(null);
  const selection = c.capture?.kind === "html" ? c.capture.selection : null;
  const intent = c.invocation;
  useEffect(() => {
    if (intent && intent.intent !== "capture") {
      comment.current?.focus();
    }
  }, [intent]);
  if (c.capture?.kind === "pdf") {
    return (
      <p className="hint">
        Chrome’s PDF viewer does not share selections. Save the PDF, then highlight it in Reader.
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
        <label className="checkbox">
          <input
            type="checkbox"
            checked={c.draft.highlight}
            onChange={(event) => update({ highlight: event.target.checked })}
          />
          Save this highlight
        </label>
        <button type="button" className="text-button" onClick={c.clearSelection}>
          Clear
        </button>
      </div>
      {c.draft.highlight ? (
        <>
          <fieldset className="colors">
            <legend>Colour</legend>
            {highlightColors.map((color) => (
              <label key={color} className={`swatch swatch-${color}`}>
                <input
                  type="radio"
                  name="color"
                  value={color}
                  checked={c.draft.color === color}
                  onChange={() => update({ color })}
                />
                <span>{color}</span>
              </label>
            ))}
          </fieldset>
          <label htmlFor="comment">
            Comment <span>(optional)</span>
          </label>
          <textarea
            id="comment"
            ref={comment}
            value={c.draft.comment}
            rows={3}
            onChange={(event) => update({ comment: event.target.value })}
          />
          <label htmlFor="highlight-tags">
            Highlight tags <span>(comma-separated, optional)</span>
          </label>
          <input
            id="highlight-tags"
            value={c.draft.highlightTags}
            onChange={(event) => update({ highlightTags: event.target.value })}
          />
          <p className="hint">
            Anchored to the saved reading copy. If that passage cannot be matched safely, your
            comment stays here.
          </p>
        </>
      ) : null}
    </section>
  );
}
