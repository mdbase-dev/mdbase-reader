import { DomainError } from "./errors.js";

import type { ReadingPosition } from "./source.js";

export interface QuoteSelector {
  readonly exact: string;
  readonly prefix?: string;
  readonly suffix?: string;
}

export interface TextPositionSelector {
  readonly basis: {
    readonly profile: string;
    readonly hash: string;
  };
  readonly unit: "unicode_code_point";
  readonly start: number;
  readonly end: number;
}

export type PdfQuadPoints = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export interface PdfSelector {
  readonly pageIndex: number;
  readonly coordinateSpace: {
    readonly profile: string;
    readonly box: "crop" | "media";
    readonly origin: "bottom_left" | "top_left";
  };
  readonly quadPoints: readonly PdfQuadPoints[];
}

export interface EpubSelector {
  readonly cfi: string;
}

export interface HtmlSelector {
  readonly css?: string;
  readonly xpath?: string;
}

export interface AnnotationTarget {
  readonly quote?: QuoteSelector;
  readonly textPosition?: TextPositionSelector;
  readonly pdf?: PdfSelector;
  readonly epub?: EpubSelector;
  readonly html?: HtmlSelector;
  /**
   * A place in the document with no selection, such as a bookmark. It uses the compact native
   * resume selector stored as `reading.position`.
   */
  readonly position?: ReadingPosition;
}

function validateQuote(quote: QuoteSelector): void {
  if (quote.exact.length === 0) {
    throw new DomainError("invalid-selector", "quote.exact must not be empty.");
  }
}

function validateTextPosition(position: TextPositionSelector): void {
  if (
    !Number.isInteger(position.start) ||
    !Number.isInteger(position.end) ||
    position.start < 0 ||
    position.end < position.start
  ) {
    throw new DomainError(
      "invalid-selector",
      "Text positions must use non-negative integer offsets with end at or after start.",
    );
  }
}

function validatePdf(pdf: PdfSelector): void {
  if (!Number.isInteger(pdf.pageIndex) || pdf.pageIndex < 0) {
    throw new DomainError("invalid-selector", "A PDF page index must be a non-negative integer.");
  }
  if (pdf.quadPoints.length === 0) {
    throw new DomainError(
      "invalid-selector",
      "A PDF selector must contain at least one quadrilateral.",
    );
  }
  if (pdf.quadPoints.some((quad) => quad.some((coordinate) => !Number.isFinite(coordinate)))) {
    throw new DomainError("invalid-selector", "PDF coordinates must be finite numbers.");
  }
}

function validatePosition(position: ReadingPosition): void {
  if (
    position.kind === "pdf" &&
    (!Number.isInteger(position.pageIndex) || position.pageIndex < 0)
  ) {
    throw new DomainError("invalid-selector", "A PDF page index must be a non-negative integer.");
  }
  if (position.kind === "html") {
    if (position.href.trim().length === 0) {
      throw new DomainError("invalid-selector", "An HTML position requires a document address.");
    }
    if (
      position.progression !== undefined &&
      !(position.progression >= 0 && position.progression <= 1)
    ) {
      throw new DomainError("invalid-selector", "An HTML progression must be between 0 and 1.");
    }
  }
}

export function validateAnnotationTarget(target: AnnotationTarget): void {
  if (target.quote) {
    validateQuote(target.quote);
  }
  if (target.textPosition) {
    validateTextPosition(target.textPosition);
  }
  if (target.pdf) {
    validatePdf(target.pdf);
  }
  if (target.epub?.cfi.trim().length === 0) {
    throw new DomainError("invalid-selector", "An EPUB CFI must not be empty.");
  }
  if (target.html && !target.html.css && !target.html.xpath && !target.quote) {
    throw new DomainError(
      "invalid-selector",
      "An HTML target requires CSS, XPath, or quotation evidence.",
    );
  }
  if (target.position) {
    validatePosition(target.position);
  }
}

export function targetRequiresDocument(target: AnnotationTarget): boolean {
  return [target.pdf, target.epub, target.html, target.textPosition, target.position].some(
    (selector) => selector !== undefined,
  );
}
