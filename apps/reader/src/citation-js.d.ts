declare module "citeproc" {
  interface CiteprocSystem {
    readonly retrieveItem: (id: string) => unknown;
    readonly retrieveLocale: (locale: string) => string;
  }

  interface CiteprocEngine {
    setOutputFormat(format: "text" | "html"): void;
    updateItems(ids: readonly string[]): readonly string[];
    makeBibliography(): readonly [unknown, readonly string[]];
  }

  const CSL: {
    readonly Engine: new (
      system: CiteprocSystem,
      style: string,
      locale: string,
      forceLocale: boolean,
    ) => CiteprocEngine;
  };
  export default CSL;
}

declare module "@citation-js/plugin-csl/lib-mjs/styles.json" {
  const styles: Readonly<Record<string, string>>;
  export default styles;
}

declare module "@citation-js/plugin-csl/lib-mjs/locales.json" {
  const locales: Readonly<Record<string, string>>;
  export default locales;
}
