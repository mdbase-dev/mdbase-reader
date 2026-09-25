import { openAccessCandidates } from "@mdbase-reader/web-capture";

import type { CapturedPdfFile, CaptureResult } from "./web-capture-client.js";

export interface PdfSearchServices {
  readonly capture: (
    url: string,
    options: { readonly allowPdf: true; readonly signal?: AbortSignal },
  ) => Promise<CaptureResult>;
  readonly candidates?: typeof openAccessCandidates;
  readonly signal?: AbortSignal;
}

/** Each attempt is a server-side fetch, so the search stops after a handful. */
const MAX_DIRECT_PDFS = 3;
const MAX_LANDING_PAGES = 3;

/**
 * Looks for a freely available PDF of a work: direct PDF links first, then open-access article
 * pages and the DOI's own page, following each page's `citation_pdf_url`. Paywalls and blocked
 * sites are skipped rather than reported; null means nothing was found.
 */
export async function findOpenAccessPdf(
  work: { readonly doi?: string; readonly arxiv?: string; readonly pageUrl?: string },
  services: PdfSearchServices,
): Promise<CapturedPdfFile | null> {
  const found = await (services.candidates ?? openAccessCandidates)(
    {
      ...(work.doi ? { doi: work.doi } : {}),
      ...(work.arxiv ? { arxiv: work.arxiv } : {}),
    },
    services.signal ? { signal: services.signal } : {},
  );
  const pages = [...new Set([...(work.pageUrl ? [work.pageUrl] : []), ...found.landingPages])];
  return (
    (await firstPdf(found.pdfUrls.slice(0, MAX_DIRECT_PDFS), services)) ??
    (await pdfFromPages(pages.slice(0, MAX_LANDING_PAGES), services))
  );
}

async function firstPdf(
  urls: readonly string[],
  services: PdfSearchServices,
): Promise<CapturedPdfFile | null> {
  for (const url of urls) {
    const captured = await attempt(url, services);
    if (captured?.kind === "pdf") {
      return captured;
    }
  }
  return null;
}

/** A page may itself redirect to the PDF, or name it in `citation_pdf_url`. */
async function pdfFromPages(
  pages: readonly string[],
  services: PdfSearchServices,
): Promise<CapturedPdfFile | null> {
  for (const page of pages) {
    const captured = await attempt(page, services);
    if (captured?.kind === "pdf") {
      return captured;
    }
    const linked = captured?.kind === "html" ? captured.page.scholarly.pdfUrl : undefined;
    const pdf = linked ? await firstPdf([linked], services) : null;
    if (pdf) {
      return pdf;
    }
  }
  return null;
}

async function attempt(url: string, services: PdfSearchServices): Promise<CaptureResult | null> {
  try {
    return await services.capture(url, {
      allowPdf: true,
      ...(services.signal ? { signal: services.signal } : {}),
    });
  } catch {
    services.signal?.throwIfAborted();
    return null;
  }
}

/** A readable file name for a downloaded PDF: the URL's own name, else the title. */
export function pdfFileName(url: string, title: string): string {
  let leaf = "";
  try {
    leaf = decodeURIComponent(new URL(url).pathname.split("/").at(-1) ?? "");
  } catch {
    // A malformed escape leaves the title as the name.
  }
  return /\.pdf$/iu.test(leaf) ? leaf : `${title.slice(0, 80) || "document"}.pdf`;
}
