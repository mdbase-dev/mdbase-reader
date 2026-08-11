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
