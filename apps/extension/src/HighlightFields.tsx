import { highlightPalette, offeredHighlightColor } from "@mdbase-reader/core";
import { useEffect, useRef, useState } from "react";

import { displayQuote } from "./highlight-body.js";
import { highlightKeyAction, type HighlightKeyAction } from "./highlight-keys.js";
import { modifierKey, saveBlocker } from "./SaveBar.js";
import { TagInput } from "./TagInput.js";

import type { ExtensionCaptureController } from "./capture-controller.js";
import type { CaptureDraft } from "./save-capture.js";
import type { HighlightColorKey, HighlightMeanings } from "@mdbase-reader/core";

/**
 * The selected passage and how to save it; follows the page selection live. Top to bottom
 * in the order they are used: an optional comment and tags, then one Highlight action with
 * its colour chosen beside it.
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
  const blocker = saveBlocker(c);
  const { save, clearSelection, followPageKeys } = c;
  const { colors, meanings } = c.highlight;
  // The device's colour (the one used last), or the first offered while that one is hidden.
  const chosen = offeredHighlightColor(c.draft.color, colors);
  useEffect(() => {
    if (intent?.intent === "note" || openDetails) {
      comment.current?.focus();
    }
  }, [intent, openDetails]);
  useColorKeys(selection !== null, colors, ready, save, clearSelection, followPageKeys);
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
      <blockquote>{displayQuote(selection.exact)}</blockquote>
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
      <div className="highlight-action">
        <button
          type="button"
          className={`primary highlight-button swatch-${chosen}`}
          disabled={!ready}
          aria-keyshortcuts="Control+Enter Meta+Enter"
          title={`Highlight in ${colorName(chosen, meanings)} (${modifierKey()}+Enter)`}
          onClick={() => void save({ highlight: true, color: chosen })}
        >
          {c.status === "saving" ? "Saving…" : "Highlight"}
        </button>
        <ColorChoice
          colors={colors}
          meanings={meanings}
          value={chosen}
          onChange={(color) => update({ color })}
        />
      </div>
      <div className="passage-footer">
        <p className="hint">
          {colorName(chosen, meanings, true)}
          {c.source ? "" : " · Saves the page too"}
        </p>
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
      {blocker ? <p className="hint">{blocker}</p> : null}
    </section>
  );
}

/**
 * While a passage is selected, 1, 2, 3… save it in the colour at that place in one step and
 * Esc lets it go, unless the reader is typing. The page forwards the same keys while focus is
 * in it, so they work straight after selecting there.
 */
function useColorKeys(
  selected: boolean,
  colors: readonly HighlightColorKey[],
  ready: boolean,
  save: ExtensionCaptureController["save"],
  clearSelection: () => void,
  followPageKeys: ExtensionCaptureController["followPageKeys"],
): void {
  useEffect(() => {
    if (!selected) {
      return;
    }
    const act = (action: HighlightKeyAction): void => {
      if (action?.kind === "save") {
        void save({ highlight: true, color: action.color });
      } else if (action?.kind === "clear") {
        clearSelection();
      }
    };
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
      const action = highlightKeyAction(event.key, colors, ready);
      if (action) {
        event.preventDefault();
        act(action);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    const disarm = followPageKeys({ colors: ready ? colors.length : 0, clear: true }, (key) =>
      act(highlightKeyAction(key, colors, ready)),
    );
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      disarm();
    };
  }, [clearSelection, colors, followPageKeys, ready, save, selected]);
}

/** "blue, Key point" for names, or "Blue · Key point" for the caption under the action. */
function colorName(color: HighlightColorKey, meanings: HighlightMeanings, caption = false): string {
  const label = highlightPalette[color].label;
  const meaning = meanings[color];
  const name = caption ? label : label.toLowerCase();
  return meaning ? `${name}${caption ? " · " : ", "}${meaning}` : name;
}

/**
 * The colour the Highlight button uses: the collection's colours, in its order, as a radio
 * group. Choosing one saves nothing; the number keys save in a colour in one step.
 */
function ColorChoice({
  colors,
  meanings,
  value,
  onChange,
}: {
  readonly colors: readonly HighlightColorKey[];
  readonly meanings: HighlightMeanings;
  readonly value: HighlightColorKey;
  readonly onChange: (color: HighlightColorKey) => void;
}): React.JSX.Element {
  const group = useRef<HTMLDivElement>(null);
  // Arrow keys move the choice, and focus with it, as in a native radio group.
  const onKeyDown = (event: React.KeyboardEvent): void => {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    const next = step
      ? colors[(colors.indexOf(value) + step + colors.length) % colors.length]
      : null;
    if (next) {
      event.preventDefault();
      onChange(next);
      group.current?.querySelector<HTMLElement>(`[data-color="${next}"]`)?.focus();
    }
  };
  return (
    <div ref={group} className="color-choice" role="radiogroup" aria-label="Highlight colour">
      {colors.map((color, index) => (
        <button
          key={color}
          type="button"
          role="radio"
          data-color={color}
          className={`color-dot swatch-${color}`}
          aria-checked={color === value}
          aria-label={colorName(color, meanings)}
          aria-keyshortcuts={String(index + 1)}
          tabIndex={color === value ? 0 : -1}
          title={`${colorName(color, meanings, true)} (press ${String(index + 1)} to highlight in it at once)`}
          onClick={() => onChange(color)}
          onKeyDown={onKeyDown}
        />
      ))}
    </div>
  );
}
