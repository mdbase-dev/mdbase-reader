declare module "@citation-js/core" {
  interface CitationFormatOptions {
    readonly format: "text" | "html";
    readonly template: string;
    readonly lang: string;
  }

  export default class Cite {
    public constructor(data: unknown);
    public format(kind: "bibliography", options: CitationFormatOptions): string;
  }
}

declare module "@citation-js/plugin-csl";
