// Apps compile this source directly, so it brings the untyped modules' declarations along.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- see above
/// <reference path="./citation-js.d.ts" />

/**
 * A CSL-JSON item, as `CslItem` in @mdbase-reader/core describes it; only its id is read
 * here, so this package need not depend on core.
 */
import { t } from "@lingui/core/macro";

export type CitationItem = Readonly<Record<string, unknown>> & { readonly id: string };

/**
 * The CSL styles bundled with @citation-js/plugin-csl, rendered by citeproc-js. Labels name the
 * edition each bundled style implements, so a copied citation is honest about its rules.
 */
export const citationStyles = [
  ["apa", "APA 7th"],
  ["harvard1", "Harvard (Cite Them Right 12th)"],
  ["vancouver", "Vancouver"],
] as const;

export function citationStyleLabel(style: string): string {
  return citationStyles.find(([value]) => value === style)?.[1] ?? style;
}

export type RenderedCitation =
  | { readonly kind: "formatted"; readonly text: string }
  | { readonly kind: "empty" }
  | { readonly kind: "failed" };

/** The formatted bibliography entry as plain text, rendered by citeproc-js. */
export async function renderCitation(
  citation: CitationItem,
  template: string,
  lang: string,
): Promise<RenderedCitation> {
  try {
    const [{ default: CSL }, { default: styles }, { default: locales }, italian] =
      await Promise.all([
        import("citeproc"),
        import("@citation-js/plugin-csl/lib-mjs/styles.json"),
        import("@citation-js/plugin-csl/lib-mjs/locales.json"),
        lang === "it-IT" ? import("./locales/csl-it-IT.xml?raw") : Promise.resolve(null),
      ]);
    const engine = new CSL.Engine(
      {
        retrieveItem: () => citation,
        retrieveLocale: (locale) =>
          (locale === "it-IT" ? italian?.default : undefined) ??
          locales[locale] ??
          locales[locale.replace("-", "_")] ??
          locales["en-US"] ??
          "",
      },
      styles[template] ?? styles["apa"] ?? "",
      lang,
      true,
    );
    engine.setOutputFormat("text");
    engine.updateItems([citation.id]);
    const bibliography = engine.makeBibliography();
    const text = bibliography[1].join("").trim();
    return text ? { kind: "formatted", text } : { kind: "empty" };
  } catch {
    return { kind: "failed" };
  }
}

/** The rendered text, or a sentence explaining why there is none. */
export function renderedCitationText(rendered: RenderedCitation): string {
  switch (rendered.kind) {
    case "formatted":
      return rendered.text;
    case "empty":
      return t`Add more details to preview this citation.`;
    case "failed":
      return t`This citation cannot be formatted yet. Check its title, contributors, and date.`;
  }
}

export async function formatCitation(
  citation: CitationItem,
  template: string,
  lang: string,
): Promise<string> {
  return renderedCitationText(await renderCitation(citation, template, lang));
}
