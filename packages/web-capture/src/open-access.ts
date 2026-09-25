/**
 * Where a free copy of a work may be found. `pdfUrls` point straight at PDFs; `landingPages`
 * are open-access article pages whose `citation_pdf_url` tag usually names the PDF. The DOI's
 * own landing page comes last, since it is often a paywall.
 */
export interface OpenAccessCandidates {
  readonly pdfUrls: readonly string[];
  readonly landingPages: readonly string[];
}

export interface OpenAccessOptions {
  readonly fetch?: typeof fetch;
  readonly signal?: AbortSignal;
  /**
   * Unpaywall asks every client for a contact address, sent with each request. Without one it
   * is skipped and OpenAlex's open-access locations are used alone.
   */
  readonly unpaywallEmail?: string;
}

/** PubMed pages are abstracts, never full text. */
const abstractOnlyHosts = /(^|\.)pubmed\.ncbi\.nlm\.nih\.gov$/u;

export async function openAccessCandidates(
  work: { readonly doi?: string; readonly arxiv?: string },
  options: OpenAccessOptions = {},
): Promise<OpenAccessCandidates> {
  const arxiv = work.arxiv ?? /^10\.48550\/arxiv\.(.+)$/iu.exec(work.doi ?? "")?.[1];
  const pdfUrls: string[] = arxiv ? [`https://arxiv.org/pdf/${arxiv}`] : [];
  const landingPages: string[] = [];
  if (work.doi && !arxiv) {
    const [unpaywall, openAlex] = await Promise.all([
      options.unpaywallEmail ? unpaywallPdfs(work.doi, options) : Promise.resolve([]),
      openAlexLocations(work.doi, options),
    ]);
    pdfUrls.push(...unpaywall, ...openAlex.pdfUrls);
    landingPages.push(...openAlex.landingPages, `https://doi.org/${work.doi}`);
  }
  return { pdfUrls: unique(pdfUrls), landingPages: unique(landingPages) };
}

async function unpaywallPdfs(doi: string, options: OpenAccessOptions): Promise<string[]> {
  const value = await optionalJson(
    `https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${encodeURIComponent(options.unpaywallEmail ?? "")}`,
    options,
  );
  const locations = [value?.["best_oa_location"], ...arrayOf(value?.["oa_locations"])];
  return locations.flatMap((location) => {
    const url = isRecord(location) ? httpsUrl(location["url_for_pdf"]) : undefined;
    return url ? [url] : [];
  });
}

async function openAlexLocations(
  doi: string,
  options: OpenAccessOptions,
): Promise<{ pdfUrls: string[]; landingPages: string[] }> {
  const value = await optionalJson(
    `https://api.openalex.org/works/doi:${encodeURIComponent(doi)}?select=best_oa_location,locations`,
    options,
  );
  const locations = [value?.["best_oa_location"], ...arrayOf(value?.["locations"])].filter(
    (location): location is Readonly<Record<string, unknown>> =>
      isRecord(location) && location["is_oa"] === true,
  );
  return {
    pdfUrls: locations.flatMap((location) => {
      const url = httpsUrl(location["pdf_url"]);
      return url ? [url] : [];
    }),
    landingPages: locations.flatMap((location) => {
      const url = httpsUrl(location["landing_page_url"]);
      return url && !abstractOnlyHosts.test(new URL(url).hostname) ? [url] : [];
    }),
  };
}

/** Discovery is best effort: a failing index narrows the search rather than ending it. */
async function optionalJson(
  url: string,
  options: OpenAccessOptions,
): Promise<Readonly<Record<string, unknown>> | undefined> {
  const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  try {
    const response = await fetcher(url, {
      headers: { Accept: "application/json" },
      credentials: "omit",
      ...(options.signal ? { signal: options.signal } : {}),
    });
    const value: unknown = response.ok ? await response.json() : undefined;
    return isRecord(value) ? value : undefined;
  } catch {
    options.signal?.throwIfAborted();
    return undefined;
  }
}

function httpsUrl(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  try {
    const url = new URL(value);
    // Plain-HTTP repository links are common and capture accepts only HTTPS, so ask for it.
    if (url.protocol === "http:") {
      url.protocol = "https:";
    }
    return url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function arrayOf(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
