import { Select, type SelectItems } from "@mdbase-dev/ui/select";
import { useEffect, useRef, useState, type JSX } from "react";

import { writeCitationDrag } from "./citation-drag.js";
import {
  citationStyleLabel,
  citationStyles,
  renderCitation,
  renderedCitationText,
  type RenderedCitation,
} from "./citation-renderer.js";
import { CheckIcon, CopyIcon } from "./icons.js";
import { useSessionChoice } from "./use-session-choice.js";

import type { CslItem } from "@mdbase-reader/core";

const styleValues = citationStyles.map(([value]) => value);
const localeOptions = [
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "de-DE", label: "Deutsch" },
  { value: "fr-FR", label: "Français" },
] as const satisfies SelectItems;
const localeValues = localeOptions.map(({ value }) => value);

/** The style and locale chosen for formatted citations, shared by every preview this session. */
export function useCitationFormat(): {
  readonly style: string;
  readonly locale: string;
  readonly setStyle: (style: string) => void;
  readonly setLocale: (locale: string) => void;
} {
  const [style, setStyle] = useSessionChoice<string>("citation.style", styleValues, "apa");
  const [locale, setLocale] = useSessionChoice<string>("citation.locale", localeValues, "en-US");
  return { style, locale, setStyle, setLocale };
}

function useRenderedCitation(
  citation: CslItem | null,
  style: string,
  locale: string,
): RenderedCitation | null {
  const [rendered, setRendered] = useState<RenderedCitation | null>(null);
  useEffect(() => {
    if (!citation) {
      return;
    }
    let current = true;
    void renderCitation(citation, style, locale).then((value) => {
      if (current) {
        setRendered(value);
      }
    });
    return () => {
      current = false;
    };
  }, [citation, locale, style]);
  return citation ? rendered : null;
}

/**
 * The formatted citation leads the Citation tab, set in the reading face, with its style and a
 * Copy action. It is also the drag handle for inserting `[@key]` into a note.
 */
export function CitationPreview({
  citation,
  format,
}: {
  /** `null` while the draft is not valid CSL-JSON. */
  readonly citation: CslItem | null;
  readonly format: ReturnType<typeof useCitationFormat>;
}): JSX.Element {
  const rendered = useRenderedCitation(citation, format.style, format.locale);
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const text = !citation
    ? "This citation can’t be formatted until its details are fixed."
    : rendered
      ? renderedCitationText(rendered)
      : "Preparing citation…";
  const formatted = rendered?.kind === "formatted" ? rendered.text : null;
  const copy = (): void => {
    if (!formatted) {
      return;
    }
    const label = citationStyleLabel(format.style);
    void navigator.clipboard.writeText(formatted).then(
      () => {
        setCopied(`Copied as ${label}`);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(null), 2400);
      },
      () => setCopied("Copying is unavailable here. Select the citation to copy it."),
    );
  };
  return (
    <figure className="citation-reference" aria-label="Formatted citation">
      <p
        className={formatted ? "citation-reference-text" : "citation-reference-text is-pending"}
        draggable={citation !== null}
        title={citation ? "Drag to insert this citation" : undefined}
        onDragStart={(event) => citation && writeCitationDrag(event.dataTransfer, citation)}
      >
        {text}
      </p>
      <div className="citation-reference-actions">
        <Select
          className="citation-quiet-select"
          aria-label="Citation style"
          value={format.style}
          options={citationStyles.map(([value, label]) => ({ value, label }))}
          onChange={format.setStyle}
        />
        <Select
          className="citation-quiet-select"
          aria-label="Citation locale"
          value={format.locale}
          options={localeOptions}
          onChange={format.setLocale}
        />
        <button type="button" className="citation-button" disabled={!formatted} onClick={copy}>
          {copied?.startsWith("Copied") ? <CheckIcon /> : <CopyIcon />}
          {copied?.startsWith("Copied") ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="citation-copy-status" role="status">
        {copied ?? ""}
      </p>
    </figure>
  );
}

/** The live preview under the Fix details form, in the chosen style. */
export function CitationPreviewLine({
  citation,
  format,
}: {
  readonly citation: CslItem | null;
  readonly format: ReturnType<typeof useCitationFormat>;
}): JSX.Element {
  const rendered = useRenderedCitation(citation, format.style, format.locale);
  return (
    <p
      className="citation-preview-line"
      aria-label={`Preview in ${citationStyleLabel(format.style)}`}
    >
      {!citation
        ? "The preview returns once the details can be saved."
        : rendered
          ? renderedCitationText(rendered)
          : "Preparing citation…"}
    </p>
  );
}
