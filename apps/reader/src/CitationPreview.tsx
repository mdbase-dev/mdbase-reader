import { t as translate } from "@lingui/core/macro";
import { useLingui as useLocale } from "@lingui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Select, type SelectItems } from "@mdbase-dev/ui/select";
import {
  citationStyleLabel,
  citationStyles,
  renderCitation,
  renderedCitationText,
  type RenderedCitation,
} from "@mdbase-reader/ui/citation";
import { useEffect, useRef, useState, type JSX } from "react";

import { writeCitationDrag } from "./citation-drag.js";
import { CheckIcon, CopyIcon } from "./icons.js";
import { copyText } from "./selection-copy.js";
import { useSessionChoice } from "./use-session-choice.js";

import type { CslItem } from "@mdbase-reader/core";

const styleValues = citationStyles.map(([value]) => value);
const localeOptions = [
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "de-DE", label: "Deutsch" },
  { value: "fr-FR", label: "Français" },
  { value: "it-IT", label: "Italiano" },
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
  const { t } = useLingui();
  const rendered = useRenderedCitation(citation, format.style, format.locale);
  const [copied, setCopied] = useState<CitationCopyState>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const text = !citation
    ? translate`This citation can’t be formatted until its details are fixed.`
    : rendered
      ? renderedCitationText(rendered)
      : translate`Preparing citation…`;
  const formatted = rendered?.kind === "formatted" ? rendered.text : null;
  const copy = (): void => {
    if (!formatted) {
      return;
    }
    const label = citationStyleLabel(format.style);
    void copyKeepingFocus(formatted).then(
      () => {
        setCopied({ kind: "copied", label });
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(null), 2400);
      },
      () => {
        clearTimeout(timer.current);
        setCopied({ kind: "failed" });
      },
    );
  };
  const failed = copied?.kind === "failed";
  const copyMessage = citationCopyMessage(copied);
  return (
    <figure
      className="citation-reference"
      aria-label={translate({ message: "Formatted citation" })}
    >
      <p
        className={formatted ? "citation-reference-text" : "citation-reference-text is-pending"}
        draggable={citation !== null}
        title={citation ? translate({ message: "Drag to insert this citation" }) : undefined}
        onDragStart={(event) => citation && writeCitationDrag(event.dataTransfer, citation)}
      >
        {text}
      </p>
      <div className="citation-reference-actions">
        <Select
          className="citation-quiet-select"
          aria-label={t({ message: "Citation style", context: "CitationPreview interface" })}
          value={format.style}
          options={citationStyles.map(([value, label]) => ({ value, label }))}
          onChange={format.setStyle}
        />
        <Select
          className="citation-quiet-select"
          aria-label={t({ message: "Citation locale", context: "CitationPreview interface" })}
          value={format.locale}
          options={localeOptions}
          onChange={format.setLocale}
        />
        <button type="button" className="citation-button" disabled={!formatted} onClick={copy}>
          {copied?.kind === "copied" ? <CheckIcon /> : <CopyIcon />}
          {copied?.kind === "copied"
            ? translate({ message: "Copied" })
            : translate({ message: "Copy" })}
        </button>
      </div>
      <p
        className={failed ? "citation-copy-status is-failed" : "citation-copy-status"}
        role="status"
      >
        {copyMessage}
      </p>
    </figure>
  );
}

type CitationCopyState =
  { readonly kind: "copied"; readonly label: string } | { readonly kind: "failed" } | null;

function citationCopyMessage(state: CitationCopyState): string {
  if (!state) {
    return "";
  }
  if (state.kind === "failed") {
    return translate`Copying is unavailable here. Select the citation to copy it.`;
  }
  return translate`Copied as ${state.label}`;
}

/**
 * Copies text, falling back when the Clipboard API is missing or refused (see `copyText`). The
 * fallback selects a hidden field, so focus returns to whatever had it, normally the button.
 */
export async function copyKeepingFocus(text: string): Promise<void> {
  const active = document.activeElement;
  try {
    await copyText(text);
  } finally {
    if (active instanceof HTMLElement && document.activeElement !== active) {
      active.focus();
    }
  }
}

/** The live preview under the Fix details form, in the chosen style. */
export function CitationPreviewLine({
  citation,
  format,
}: {
  readonly citation: CslItem | null;
  readonly format: ReturnType<typeof useCitationFormat>;
}): JSX.Element {
  useLocale();
  const rendered = useRenderedCitation(citation, format.style, format.locale);
  return (
    <p className="citation-preview-line">
      <span className="sr-only">
        <Trans>Preview in </Trans>
        {citationStyleLabel(format.style)}:{" "}
      </span>
      {!citation
        ? translate({ message: "The preview returns once the details can be saved." })
        : rendered
          ? renderedCitationText(rendered)
          : translate({
              message: "Preparing citation…",
              context: "CitationPreview status or action",
            })}
    </p>
  );
}
