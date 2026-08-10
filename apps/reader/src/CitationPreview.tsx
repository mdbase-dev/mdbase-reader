import { useEffect, useState, type JSX } from "react";

import type { CslItem } from "@mdbase-reader/core";

export const citationStyles = [
  ["apa", "APA"],
  ["harvard1", "Cite Them Right (Harvard)"],
  ["vancouver", "Vancouver"],
] as const;

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
    <section className="citation-proof" aria-label="Formatted citation preview">
      <div className="citation-proof-controls">
        <span>Live proof</span>
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
      </div>
      <blockquote>{preview}</blockquote>
    </section>
  );
}

export async function formatCitation(
  citation: CslItem,
  template: string,
  lang: string,
): Promise<string> {
  try {
    const [{ default: CSL }, { default: styles }, { default: locales }] = await Promise.all([
      import("citeproc"),
      import("@citation-js/plugin-csl/lib-mjs/styles.json"),
      import("@citation-js/plugin-csl/lib-mjs/locales.json"),
    ]);
    const engine = new CSL.Engine(
      {
        retrieveItem: () => citation,
        retrieveLocale: (locale) =>
          locales[locale] ?? locales[locale.replace("-", "_")] ?? locales["en-US"] ?? "",
      },
      styles[template] ?? styles["apa"] ?? "",
      lang,
      true,
    );
    engine.setOutputFormat("text");
    engine.updateItems([citation.id]);
    const bibliography = engine.makeBibliography();
    return bibliography[1].join("").trim() || "Add more details to preview this citation.";
  } catch {
    return "This citation cannot be formatted yet. Check its title, contributors, and date.";
  }
}
