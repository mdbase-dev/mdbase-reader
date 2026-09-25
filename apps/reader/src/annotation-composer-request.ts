import { sourceLink } from "@mdbase-reader/core";

import type {
  AnnotationCreationRequest,
  Locator,
  PdfQuadPoints,
  ReadingPosition,
  Source,
} from "@mdbase-reader/core";
import type {
  AreaSelectionDraft,
  ReaderLocator,
  ReadingSurface,
  TextSelectionDraft,
} from "@mdbase-reader/reading-surface";

export type ComposerSelection =
  | { readonly kind: "text"; readonly value: TextSelectionDraft }
  | { readonly kind: "area"; readonly value: AreaSelectionDraft };

const preparedAreaImages = new WeakMap<Blob, Promise<Uint8Array>>();

/** Start decoding the captured Blob as soon as EmbedPDF emits it. */
export function prepareAnnotationSelection(selection: ComposerSelection): void {
  if (selection.kind === "area") {
    void areaImageBytes(selection.value.image).catch(() => undefined);
  }
}

export async function annotationRequest(
  source: Source,
  surface: ReadingSurface,
  selection: ComposerSelection,
  note: string,
): Promise<AnnotationCreationRequest> {
  if (selection.kind === "text") {
    return textAnnotationRequest(source, surface, selection.value, note);
  }
  return areaAnnotationRequest(source, surface, selection.value, note);
}

/** A comment about the whole source: no document, position or quotation. */
export function commentRequest(source: Source, comment: string): AnnotationCreationRequest {
  return {
    sourceRecord: source,
    collectionId: source.collectionId,
    sourceId: source.id,
    source: sourceLink(source),
    annotationType: "note",
    motivation: "commenting",
    tags: [],
    body: comment.trim(),
  };
}

/** A bookmark at the surface's current reading position, or null when it has none. */
export function bookmarkRequest(
  source: Source,
  surface: ReadingSurface,
): AnnotationCreationRequest | null {
  const location = surface.currentLocation();
  const position = location ? readingPosition(location) : null;
  if (!position) {
    return null;
  }
  return {
    ...annotationIdentity(source, surface),
    annotationType: "bookmark",
    motivation: "bookmarking",
    locator: positionLabel(position),
    target: { position },
    tags: [],
    body: "",
  };
}

function readingPosition(locator: ReaderLocator): ReadingPosition | null {
  if (locator.kind === "pdf") {
    return { kind: "pdf", pageIndex: locator.pageIndex };
  }
  if (locator.kind === "epub") {
    return { kind: "epub", locator: locator.locator };
  }
  return locator.href.trim()
    ? {
        kind: "html",
        href: locator.href,
        ...(locator.progression === undefined
          ? {}
          : { progression: Math.min(1, Math.max(0, locator.progression)) }),
      }
    : null;
}

function positionLabel(position: ReadingPosition): Locator {
  if (position.kind === "pdf") {
    return { label: `p. ${String(position.pageIndex + 1)}` };
  }
  const progression =
    position.kind === "html" ? position.progression : epubProgression(position.locator);
  const title = position.kind === "epub" ? epubTitle(position.locator) : undefined;
  const place =
    progression === undefined
      ? undefined
      : progression < 0.01
        ? "Start"
        : `${String(Math.round(progression * 100))}% through`;
  return { label: [title, place].filter(Boolean).join(" · ") || "Saved position" };
}

function epubProgression(locator: Readonly<Record<string, unknown>>): number | undefined {
  const locations = locator["locations"];
  const value =
    typeof locations === "object" && locations !== null
      ? (locations as Readonly<Record<string, unknown>>)["totalProgression"]
      : undefined;
  return typeof value === "number" && value >= 0 && value <= 1 ? value : undefined;
}

function epubTitle(locator: Readonly<Record<string, unknown>>): string | undefined {
  const title = locator["title"];
  return typeof title === "string" && title.trim() ? title.trim() : undefined;
}

function textAnnotationRequest(
  source: Source,
  surface: ReadingSurface,
  selection: TextSelectionDraft,
  note: string,
): AnnotationCreationRequest {
  return {
    ...annotationIdentity(source, surface),
    annotationType: "highlight",
    motivation: note.trim() ? "commenting" : "highlighting",
    color: "yellow",
    locator: locatorLabel(selection.locator),
    target: selection.target,
    tags: [],
    body: quotationBody(selection.target.quote.exact, note),
  };
}

async function areaAnnotationRequest(
  source: Source,
  surface: ReadingSurface,
  selection: AreaSelectionDraft,
  note: string,
): Promise<AnnotationCreationRequest> {
  if (selection.imageType !== "image/png") {
    throw new Error(`Reader cannot persist an area capture of type ${selection.imageType}.`);
  }
  return {
    ...annotationIdentity(source, surface),
    annotationType: "area",
    motivation: note.trim() ? "commenting" : "highlighting",
    locator: { label: `p. ${String(selection.pageIndex + 1)}` },
    target: {
      pdf: {
        pageIndex: selection.pageIndex,
        coordinateSpace: {
          profile: selection.coordinateProfile,
          box: "crop",
          origin: "top_left",
        },
        quadPoints: [rectQuad(selection.rect)],
      },
    },
    tags: [],
    body: note.trim(),
    attachment: {
      bytes: await areaImageBytes(selection.image),
      mediaType: "image/png",
    },
  };
}

function areaImageBytes(image: Blob): Promise<Uint8Array> {
  const prepared = preparedAreaImages.get(image);
  if (prepared) {
    return prepared;
  }
  const pending = image.arrayBuffer().then(
    (buffer) => new Uint8Array(buffer),
    (reason: unknown) => {
      preparedAreaImages.delete(image);
      throw reason;
    },
  );
  preparedAreaImages.set(image, pending);
  return pending;
}

function annotationIdentity(
  source: Source,
  surface: ReadingSurface,
): Pick<
  AnnotationCreationRequest,
  "sourceRecord" | "collectionId" | "sourceId" | "source" | "document"
> {
  return {
    sourceRecord: source,
    collectionId: source.collectionId,
    sourceId: source.id,
    source: sourceLink(source),
    document: surface.document.document,
  };
}

function rectQuad(rect: AreaSelectionDraft["rect"]): PdfQuadPoints {
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  return [rect.x, rect.y, right, rect.y, rect.x, bottom, right, bottom];
}

function locatorLabel(locator: ReaderLocator): Locator {
  if (locator.kind === "pdf") {
    return { label: `p. ${String(locator.pageIndex + 1)}` };
  }
  return { label: locator.kind === "epub" ? "EPUB location" : locator.href };
}

function quotationBody(quote: string, note: string): string {
  const quotation = quote
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  const commentary = note.trim();
  return commentary ? `${quotation}\n\n${commentary}` : quotation;
}
