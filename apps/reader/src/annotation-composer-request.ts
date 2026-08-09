import type {
  AnnotationCreationRequest,
  Locator,
  PdfQuadPoints,
  SourceSummary,
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

export async function annotationRequest(
  source: SourceSummary,
  surface: ReadingSurface,
  selection: ComposerSelection,
  note: string,
): Promise<AnnotationCreationRequest> {
  if (selection.kind === "text") {
    return textAnnotationRequest(source, surface, selection.value, note);
  }
  return areaAnnotationRequest(source, surface, selection.value, note);
}

function textAnnotationRequest(
  source: SourceSummary,
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
  source: SourceSummary,
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
      bytes: new Uint8Array(await selection.image.arrayBuffer()),
      mediaType: "image/png",
    },
  };
}

function annotationIdentity(
  source: SourceSummary,
  surface: ReadingSurface,
): Pick<AnnotationCreationRequest, "collectionId" | "sourceId" | "source" | "document"> {
  return {
    collectionId: source.collectionId,
    sourceId: source.id,
    source: `[[${source.id}]]`,
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
