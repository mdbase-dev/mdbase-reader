import { PDFDocument, PDFName, PDFNumber } from "pdf-lib";

import type { Fields } from "./model.js";

export interface PdfPageGeometry {
  left: number;
  bottom: number;
  right: number;
  top: number;
  rotation: number;
}

/** Read only: originals are never saved or rewritten. Keep geometry, not PDF objects, cached. */
export async function readPdfGeometry(blob: Blob): Promise<PdfPageGeometry[]> {
  const pdf = await PDFDocument.load(await blob.arrayBuffer(), { updateMetadata: false });
  return pdf.getPages().map((page) => {
    const unit = page.node.lookupMaybe(PDFName.of("UserUnit"), PDFNumber)?.asNumber() ?? 1;
    if (unit !== 1) {
      throw new Error("Non-default PDF UserUnit is not yet supported.");
    }
    const media = page.getMediaBox();
    const crop = page.getCropBox();
    const geometry = {
      left: Math.max(media.x, crop.x),
      bottom: Math.max(media.y, crop.y),
      right: Math.min(media.x + media.width, crop.x + crop.width),
      top: Math.min(media.y + media.height, crop.y + crop.height),
      rotation: ((page.getRotation().angle % 360) + 360) % 360,
    };
    validateGeometry(geometry);
    return geometry;
  });
}

function validateGeometry(page: PdfPageGeometry): void {
  if (
    !Object.values(page).every(Number.isFinite) ||
    page.right <= page.left ||
    page.top <= page.bottom ||
    ![0, 90, 180, 270].includes(page.rotation)
  ) {
    throw new Error("Unsupported PDF page geometry.");
  }
}

/** Zotero rects are PDF default-user-space coordinates, not screen rectangles.
 * EmbedPDF selection coordinates include intrinsic rotation and the crop/media intersection.
 * See Zotero reader src/pdf/lib/coordinates.js and PDFium FPDF_PageToDevice.
 */
export function convertZoteroPdfPosition(
  raw: unknown,
  pages: readonly PdfPageGeometry[],
  kind: string,
): Fields {
  const position: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!position || typeof position !== "object" || Array.isArray(position)) {
    throw new Error("Invalid Zotero PDF position.");
  }
  const value = position as Record<string, unknown>;
  const index = value["pageIndex"];
  if (typeof index !== "number" || !Number.isInteger(index) || index < 0 || !pages[index]) {
    throw new Error("Zotero PDF page is unavailable.");
  }
  if (
    value["nextPageRects"] !== undefined ||
    value["paths"] !== undefined ||
    !["highlight", "note", "image"].includes(kind)
  ) {
    throw new Error("Multi-page or ink geometry is not yet supported.");
  }
  const rects = value["rects"];
  if (!Array.isArray(rects) || rects.length === 0) {
    throw new Error("Missing Zotero PDF rectangles.");
  }
  const page = pages[index];
  validateGeometry(page);
  const quads = rects.map((rect: unknown) => {
    if (!Array.isArray(rect) || rect.length !== 4 || !rect.every(Number.isFinite)) {
      throw new Error("Invalid Zotero PDF rectangle.");
    }
    const [left, bottom, right, top] = rect as [number, number, number, number];
    if (left >= right || bottom >= top) {
      throw new Error("Empty Zotero PDF rectangle.");
    }
    const corners: [number, number][] = [
      [left, bottom],
      [right, top],
      [left, top],
      [right, bottom],
    ];
    const points = corners.map(([x, y]) => viewportPoint(page, x, y));
    const x1 = Math.min(...points.map((p) => p[0]));
    const y1 = Math.min(...points.map((p) => p[1]));
    const x2 = Math.max(...points.map((p) => p[0]));
    const y2 = Math.max(...points.map((p) => p[1]));
    return [x1, y1, x2, y1, x1, y2, x2, y2];
  });
  return {
    page_index: index,
    coordinate_space: {
      profile:
        kind === "image" ? "embedpdf-capture-page-points-v1" : "embedpdf-selection-page-points-v1",
      box: "crop",
      origin: "top_left",
    },
    quad_points: quads,
  };
}

function viewportPoint(page: PdfPageGeometry, x: number, y: number): [number, number] {
  if (page.rotation === 90) {
    return [y - page.bottom, x - page.left];
  }
  if (page.rotation === 180) {
    return [page.right - x, y - page.bottom];
  }
  if (page.rotation === 270) {
    return [page.top - y, page.right - x];
  }
  return [x - page.left, page.top - y];
}
