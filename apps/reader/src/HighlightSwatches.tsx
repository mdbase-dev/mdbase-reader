import { highlightColorKeys, type HighlightColorKey } from "@mdbase-reader/core";

import { highlightColorName, type HighlightMeanings } from "./highlight-colors.js";

import type { JSX } from "react";

/**
 * The five highlight colours as buttons. For a selection each one saves a highlight in that
 * colour, and the one H uses is ringed; for a highlight each one changes its colour, and its
 * current colour is ringed and pressed. Names carry the colour and its meaning, so nothing
 * depends on telling the inks apart.
 */
export function HighlightSwatches({
  mode,
  ringed,
  meanings,
  disabled = false,
  shortcuts = true,
  onChoose,
}: {
  /** Whether H and 1–5 choose these swatches, as in the selection toolbar. */
  readonly shortcuts?: boolean;
  readonly mode: "highlight" | "recolor";
  /** The colour H uses, or the highlight's current colour. */
  readonly ringed: HighlightColorKey | null;
  readonly meanings: HighlightMeanings;
  readonly disabled?: boolean | undefined;
  readonly onChoose: (color: HighlightColorKey) => void;
}): JSX.Element {
  return (
    <div
      className="highlight-swatches"
      role="group"
      aria-label={mode === "highlight" ? "Highlight in a colour" : "Highlight colour"}
    >
      {highlightColorKeys.map((key, index) => {
        const name = highlightColorName(key, meanings);
        const digit = String(index + 1);
        const keys = mode === "highlight" && key === ringed ? `H or ${digit}` : digit;
        return (
          <button
            key={key}
            type="button"
            className={`highlight-swatch${key === ringed ? " is-ringed" : ""}`}
            data-highlight-color={key}
            disabled={disabled}
            aria-label={mode === "highlight" ? `Highlight ${name}` : name}
            {...(mode === "recolor" ? { "aria-pressed": key === ringed } : {})}
            {...(shortcuts ? { "aria-keyshortcuts": keys.replace(" or ", " ") } : {})}
            title={`${mode === "highlight" ? "Highlight " : ""}${name}${shortcuts ? ` (${keys})` : ""}`}
            onClick={() => onChoose(key)}
          >
            <i aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
