import { t as translate } from "@lingui/core/macro";
import { useLingui as useLocale } from "@lingui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { ChevronDownIcon } from "@mdbase-reader/ui";
import {
  citationStyleLabel,
  renderCitation,
  renderedCitationText,
  type RenderedCitation,
} from "@mdbase-reader/ui/citation";
import { useEffect, useRef, useState } from "react";

import { readerSourceUrl } from "./capture-model.js";
import { CitationCard, CitationDetails } from "./CitationCard.js";

import type { ExtensionCaptureController } from "./capture-controller.js";
import type { CslItem, SourceSummary } from "@mdbase-reader/core";

/** Reader's default style and locale; choosing others stays in Reader's Citation tab. */
const style = "apa";
const locale = "en-US";

/**
 * The citation: before saving, what was found for the page; after saving, what is stored
 * with the source, formatted and ready to copy. Editing stays in Reader, which has the full
 * editor.
 */
export function CitationPanel({
  controller: c,
}: {
  readonly controller: ExtensionCaptureController;
}): React.JSX.Element | null {
  if (!c.capture) {
    return null;
  }
  if (!c.source) {
    return (
      <div className="tab-section">
        <CitationCard controller={c} />
        {c.citationPending || c.citation ? null : (
          <p className="hint">
            <Trans>
              No citation details were found on this page. Save the source, then add them in Reader.
            </Trans>
          </p>
        )}
      </div>
    );
  }
  return <SavedCitation source={c.source} />;
}

function SavedCitation({ source }: { readonly source: SourceSummary }): React.JSX.Element {
  const { t } = useLingui();
  const stored = source.citation;
  const citation: CslItem | null = stored
    ? { ...stored, title: text(stored["title"]) ?? source.title }
    : null;
  const rendered = useRenderedCitation(citation);
  const [copied, setCopied] = useState<string | null>(null);
  const edit = (
    <a className="text-button" href={readerSourceUrl(source)} target="_blank" rel="noreferrer">
      {citation ? t`Edit in Reader` : t`Add a citation in Reader`}
    </a>
  );
  if (!citation) {
    return (
      <div className="tab-section">
        <p className="hint">
          <Trans>This source has no citation yet.</Trans>
        </p>
        {edit}
      </div>
    );
  }
  const formatted = rendered?.kind === "formatted" ? rendered.text : null;
  const label = citationStyleLabel(style);
  const copy = (value: string, done: string): void => {
    void navigator.clipboard.writeText(value).then(
      () => setCopied(done),
      () =>
        setCopied(translate({ message: "Couldn’t copy. Select the text and copy it instead." })),
    );
  };
  return (
    <div className="tab-section">
      <section className="citation" aria-label={translate({ message: "Stored citation" })}>
        <span className="eyebrow">{label.toUpperCase()}</span>
        {formatted ? (
          <p className="citation-reference">{formatted}</p>
        ) : (
          <>
            <CitationDetails
              citation={citation}
              doi={text(citation["DOI"])}
              citekey={citation.id}
            />
            <p className="hint">
              {rendered ? renderedCitationText(rendered) : translate({ message: "Formatting…" })}
            </p>
          </>
        )}
        {formatted ? <p className="citation-key">@{citation.id}</p> : null}
      </section>
      <div className="copy-actions">
        <button
          type="button"
          className="primary compact"
          disabled={!formatted}
          onClick={() => formatted && copy(formatted, translate`Copied as ${label}`)}
        >
          <Trans>Copy citation</Trans>
        </button>
        <CopyMenu
          items={[
            [
              translate({ message: "Copy citekey" }),
              `@${citation.id}`,
              translate({ message: "Copied the citekey" }),
            ],
            [
              translate({ message: "Copy CSL-JSON" }),
              JSON.stringify(stored, null, 2),
              translate({ message: "Copied the CSL-JSON" }),
            ],
          ]}
          onCopy={copy}
        />
      </div>
      <p className="hint copy-status" role="status">
        {copied ?? ""}
      </p>
      {edit}
    </div>
  );
}

/** The bibliography entry in Reader's default style, formatted once citeproc has loaded. */
function useRenderedCitation(citation: CslItem | null): RenderedCitation | null {
  const [rendered, setRendered] = useState<RenderedCitation | null>(null);
  const key = citation ? JSON.stringify(citation) : null;
  useEffect(() => {
    if (!key) {
      return;
    }
    let current = true;
    void renderCitation(JSON.parse(key) as CslItem, style, locale).then((value) => {
      if (current) {
        setRendered(value);
      }
    });
    return () => {
      current = false;
    };
  }, [key]);
  return key ? rendered : null;
}

/**
 * The other ways to copy, behind a small disclosure. It closes on an outside pointer,
 * Escape (returning focus to its trigger), or once an item is chosen.
 */
function CopyMenu({
  items,
  onCopy,
}: {
  /** Label, value and what to announce once copied. */
  readonly items: readonly (readonly [string, string, string])[];
  readonly onCopy: (value: string, done: string) => void;
}): React.JSX.Element {
  useLocale();
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const details = ref.current;
    if (!details) {
      return;
    }
    const onPointerDown = (event: PointerEvent): void => {
      if (details.open && !details.contains(event.target as Node)) {
        details.open = false;
      }
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && details.open) {
        event.stopPropagation();
        details.open = false;
        details.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    details.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      details.removeEventListener("keydown", onKeyDown);
    };
  }, []);
  return (
    <details className="copy-menu" ref={ref}>
      <summary
        className="secondary compact"
        aria-label={translate({ message: "More ways to copy" })}
        title={translate({ message: "More ways to copy" })}
      >
        <ChevronDownIcon />
      </summary>
      <div className="copy-menu-panel">
        {items.map(([label, value, done]) => (
          <button
            key={label}
            type="button"
            className="text-button"
            onClick={() => {
              if (ref.current) {
                ref.current.open = false;
              }
              onCopy(value, done);
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </details>
  );
}

function text(value: CslItem[string]): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}
