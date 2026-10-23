export type DomainProblemCode =
  | "invalid-identifier"
  | "invalid-revision"
  | "invalid-datetime"
  | "invalid-selector"
  | "invalid-annotation"
  | "invalid-source-import"
  | "duplicate-source-import"
  | "invalid-citation"
  | "citation-changed-elsewhere"
  | "duplicate-citekey"
  | "unsupported-source-file"
  | "unsupported-source-attachment"
  | "annotation-assets-unavailable"
  | "source-not-found"
  | "document-not-found"
  | "document-revision-mismatch";

export class DomainError extends Error {
  public readonly code: DomainProblemCode;

  public constructor(code: DomainProblemCode, message: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}

export class CitationChangedElsewhereError extends DomainError {
  public constructor(public readonly currentCitation: unknown) {
    super(
      "citation-changed-elsewhere",
      "This citation changed elsewhere. Reload it before saving.",
    );
  }
}
