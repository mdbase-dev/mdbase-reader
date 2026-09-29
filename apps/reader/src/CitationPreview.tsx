import { Select, type SelectItems } from "@mdbase-dev/ui/select";
import { useEffect, useState, type JSX } from "react";

import { citationStyles, formatCitation } from "./citation-renderer.js";

import type { CslItem } from "@mdbase-reader/core";

export function CitationPreview({ citation }: { readonly citation: CslItem }): JSX.Element {
  const [style, setStyle] = useState("apa");
  const [locale, setLocale] = useState("en-US");
  const [preview, setPreview] = useState("Preparing citation…");
  useEffect(() => {
    let current = true;
    void formatCitation(citation, style, locale).then((value) => {
      if (current) {
        setPreview(value);
      }
    });
    return () => {
      current = false;
    };
  }, [citation, locale, style]);
  return (
    <section className="citation-proof" aria-label="Citation preview">
      <header className="citation-proof-controls">
        <strong>Preview</strong>
        <label>
          <span>Style</span>
          <Select
            aria-label="Citation style"
            value={style}
            options={citationStyles.map(([value, label]) => ({ value, label }))}
            onChange={setStyle}
          />
        </label>
        <label>
          <span>Locale</span>
          <Select
            aria-label="Citation locale"
            value={locale}
            options={localeOptions}
            onChange={setLocale}
          />
        </label>
      </header>
      <blockquote>{preview}</blockquote>
    </section>
  );
}

const localeOptions: SelectItems = [
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "de-DE", label: "Deutsch" },
  { value: "fr-FR", label: "Français" },
];
