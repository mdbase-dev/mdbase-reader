import { t as translate } from "@lingui/core/macro";
import { useLingui as useLocale } from "@lingui/react";

import { highlightColorName, type HighlightMeanings } from "./highlight-colors.js";

import type { HighlightColorKey } from "@mdbase-reader/core";
import type { JSX } from "react";

/**
 * The colours the collection offers, in its order, as buttons. For a selection each one saves a
 * highlight in that colour, and the one H uses is ringed; for a highlight each one changes its
 * colour, and its current colour is ringed and pressed (a colour the collection hides is not
 * offered, so a highlight in one has none pressed). Names carry the colour and its meaning, so
 * nothing depends on telling the inks apart.
 */
export function HighlightSwatches({
  mode,
  colors,
  ringed,
  meanings,
  disabled = false,
  shortcuts = true,
  onChoose,
}: {
  /** Whether H and the digits choose these swatches, as in the selection toolbar. */
  readonly shortcuts?: boolean;
  readonly mode: "highlight" | "recolor";
  /** The colours offered, in order; 1, 2, 3… choose them by place. */
  readonly colors: readonly HighlightColorKey[];
  /** The colour H uses, or the highlight's current colour. */
  readonly ringed: HighlightColorKey | null;
  readonly meanings: HighlightMeanings;
  readonly disabled?: boolean | undefined;
  readonly onChoose: (color: HighlightColorKey) => void;
}): JSX.Element {
  useLocale();
  return (
    <div
      className="highlight-swatches"
      role="group"
      aria-label={
        mode === "highlight"
          ? translate({ message: "Highlight in a colour" })
          : translate({ message: "Highlight colour" })
      }
    >
      {colors.map((key, index) => {
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
            aria-label={mode === "highlight" ? translate`Highlight ${name}` : name}
            {...(mode === "recolor" ? { "aria-pressed": key === ringed } : {})}
            {...(shortcuts ? { "aria-keyshortcuts": keys.replace(" or ", " ") } : {})}
            title={`${mode === "highlight" ? translate({ message: "Highlight " }) : ""}${name}${shortcuts ? ` (${keys})` : ""}`}
            onClick={() => onChoose(key)}
          >
            <i aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
