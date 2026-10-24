import { t } from "@lingui/core/macro";

import type { CslItem } from "@mdbase-reader/core";

export const citationStyles = [
  ["apa", "APA"],
  ["harvard1", "Cite Them Right (Harvard)"],
  ["vancouver", "Vancouver"],
] as const;

export async function formatCitation(
  citation: CslItem,
  template: string,
  lang: string,
): Promise<string> {
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
    return (
      bibliography[1].join("").trim() ||
      t({ message: "Add more details to preview this citation." })
    );
  } catch {
    return t({
      message: "This citation cannot be formatted yet. Check its title, contributors, and date.",
    });
  }
}
