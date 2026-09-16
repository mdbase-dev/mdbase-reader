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
          <select value={style} onChange={(event) => setStyle(event.target.value)}>
            {citationStyles.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Locale</span>
          <select value={locale} onChange={(event) => setLocale(event.target.value)}>
            <option value="en-US">English (US)</option>
            <option value="en-GB">English (UK)</option>
            <option value="de-DE">Deutsch</option>
            <option value="fr-FR">Français</option>
          </select>
        </label>
      </header>
      <blockquote>{preview}</blockquote>
    </section>
  );
}
