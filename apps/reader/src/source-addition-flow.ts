import { sourceKindForCitation } from "@mdbase-reader/core";
import {
  citationAuthors,
  citationForPage,
  citationYear,
  identifierLookup,
  parseSourceInput,
  postAddress,
  siteAdapters,
  type CitationDraft,
  type SourceIdentifier,
  type WebCaptureImport,
} from "@mdbase-reader/web-capture";

import { findOpenAccessPdf, pdfFileName, type PdfSearchServices } from "./open-access-pdf.js";

import type { ReaderWorkspaceController } from "./use-reader-workspace.js";
import type { CapturedPdfFile, CaptureResult } from "./web-capture-client.js";
import type {
  CitationCandidate,
  CitationResolutionRequest,
  CslProvenance,
  Source,
  SourceImportMetadata,
  SourceImportOptions,
} from "@mdbase-reader/core";

export interface SourceAdditionServices extends PdfSearchServices {
  readonly capture: (
    url: string,
    options: { readonly allowPdf: true; readonly signal?: AbortSignal },
  ) => Promise<CaptureResult>;
  readonly lookUp: (request: CitationResolutionRequest) => Promise<CitationCandidate>;
  /** Identifiers printed in a downloaded PDF, for citing a PDF saved by its address. */
  readonly pdfIdentifiers: (
    file: CapturedPdfFile,
  ) => Promise<{ readonly doi?: string; readonly arxiv?: string }>;
  readonly workspace: Pick<
    ReaderWorkspaceController,
    "importSourceFile" | "createSource" | "saveNewSourceCitation"
  >;
  readonly importOptions?: SourceImportOptions;
  readonly onStatus: (message: string) => void;
}

export type SourceAdditionOutcome =
  | {
      readonly kind: "added";
      readonly source: Source;
      readonly notices: readonly string[];
      readonly provenance?: CslProvenance;
    }
  /** The workspace reported why nothing was written. */
  | { readonly kind: "not-added" }
  /** The page could not be fetched, but its citation was found and can be saved alone. */
  | {
      readonly kind: "citation-only";
      readonly candidate: CitationCandidate;
      readonly reason: string;
    };

export async function addSourceFromInput(
  input: string,
  services: SourceAdditionServices,
): Promise<SourceAdditionOutcome> {
  const identifier = parseSourceInput(input);
  if (!identifier) {
    throw new Error("Paste a web address, DOI, arXiv ID, ISBN or PubMed ID.");
  }
  return identifier.kind === "url"
    ? addFromUrl(identifier.value, services)
    : addFromIdentifier(identifier, services);
}

async function addFromUrl(
  url: string,
  services: SourceAdditionServices,
): Promise<SourceAdditionOutcome> {
  const socialAddress = assertSocialInput(url);
  services.onStatus("Fetching the page…");
  let captured: CaptureResult;
  try {
    captured = await services.capture(url, { allowPdf: true, ...signalOf(services) });
  } catch (reason) {
    services.signal?.throwIfAborted();
    if (cannotOfferCitationOnly(socialAddress, reason)) {
      throw reason;
    }
    services.onStatus("Looking up citation details instead…");
    const candidate = await services.lookUp({ kind: "url", value: url }).catch(() => null);
    if (candidate) {
      return { kind: "citation-only", candidate, reason: messageOf(reason) };
    }
    throw reason;
  }
  if (captured.kind === "pdf") {
    const ids = await services.pdfIdentifiers(captured).catch(() => ({}));
    const candidate = await lookUpWork(ids, services);
    return importPdf(captured, candidate?.citation, captured.canonicalUrl, services);
  }
  const { page } = captured;
  services.onStatus("Looking up citation details…");
  const preview = await capturedPageCitation(page, services);
  const citation = preview?.citation ?? page.scholarly.citation;
  const fields = citation ? citationFields(citation) : undefined;
  const source = await services.workspace.importSourceFile(
    {
      name: page.name,
      declaredMediaType: "text/html",
      bytes: page.bytes,
      title: fields?.title ?? page.title,
      capture: page.capture,
      archive: page.archive,
      metadata: { ...fields?.metadata, ...page.metadata, ...authorsOf(fields) },
      ...capturedKind(page.metadata, fields?.kind),
    },
    services.importOptions,
  );
  return finish(source, citation, services, preview?.provenance);
}

function cannotOfferCitationOnly(
  address: ReturnType<typeof postAddress>,
  reason: unknown,
): boolean {
  return Boolean(address) || messageOf(reason).includes("Feeds cannot be saved as sources");
}

function capturedPageCitation(
  page: WebCaptureImport,
  services: SourceAdditionServices,
): ReturnType<typeof citationForPage> {
  return page.metadata.socialPost
    ? Promise.resolve(null)
    : citationForPage(page.claims, page.capture.canonicalUrl, {
        ...signalOf(services),
        citoid: {},
      });
}

function assertSocialInput(url: string): ReturnType<typeof postAddress> {
  const address = postAddress(url);
  if (siteAdapters.some((adapter) => adapter.matches(url)) && !address) {
    throw new Error(
      "Feeds, profiles and search pages cannot be saved. Choose individual posts in the Reader extension.",
    );
  }
  if (address?.platform === "x") {
    throw new Error("Save X posts from their live page using the mdbase Reader extension.");
  }
  return address;
}

function capturedKind(metadata: SourceImportMetadata, kind?: string): { kind?: string } {
  if (metadata.socialPost) {
    return { kind: "post" };
  }
  return kind && kind !== "webpage" ? { kind } : {};
}

async function addFromIdentifier(
  identifier: Exclude<SourceIdentifier, { kind: "url" }>,
  services: SourceAdditionServices,
): Promise<SourceAdditionOutcome> {
  services.onStatus("Looking up citation details…");
  const candidate = await services.lookUp(identifierLookup(identifier));
  const doi =
    stringField(candidate.citation, "DOI") ??
    (identifier.kind === "doi" ? identifier.value : undefined);
  services.onStatus("Looking for an open-access PDF…");
  const pdf = await findOpenAccessPdf(
    {
      ...(doi ? { doi } : {}),
      ...(identifier.kind === "arxiv" ? { arxiv: identifier.value } : {}),
    },
    services,
  );
  const url = doi ? `https://doi.org/${doi}` : stringField(candidate.citation, "URL");
  if (pdf) {
    return importPdf(pdf, candidate.citation, url, services);
  }
  // The new source opens on its empty document pane, which offers to attach a file.
  return createWithoutDocument(candidate, url, services);
}

/** Saves a found citation as a source with no document. */
export async function createWithoutDocument(
  candidate: CitationCandidate,
  url: string | undefined,
  services: Pick<SourceAdditionServices, "workspace" | "importOptions" | "onStatus">,
): Promise<SourceAdditionOutcome> {
  const { createSource } = services.workspace;
  if (!createSource) {
    throw new Error("This collection cannot hold sources without a document.");
  }
  const fields = citationFields(candidate.citation);
  services.onStatus("Saving the source…");
  const source = await createSource(
    {
      title: fields.title ?? "Untitled source",
      metadata: { ...fields.metadata, ...authorsOf(fields) },
      ...(fields.kind ? { kind: fields.kind } : {}),
      ...(url ? { url } : {}),
    },
    services.importOptions,
  );
  return finish(source, candidate.citation, services);
}

async function importPdf(
  pdf: CapturedPdfFile,
  citation: CitationDraft | undefined,
  url: string | undefined,
  services: SourceAdditionServices,
): Promise<SourceAdditionOutcome> {
  const fields = citation ? citationFields(citation) : undefined;
  const title = fields?.title ?? pdfFileName(pdf.canonicalUrl, "Document").replace(/\.pdf$/iu, "");
  services.onStatus("Saving the PDF…");
  const source = await services.workspace.importSourceFile(
    {
      name: pdfFileName(pdf.canonicalUrl, title),
      declaredMediaType: "application/pdf",
      bytes: pdf.bytes,
      title,
      metadata: { ...fields?.metadata, ...authorsOf(fields) },
      kind: fields?.kind ?? "document",
      url: url ?? pdf.canonicalUrl,
    },
    services.importOptions,
  );
  return finish(source, citation, services);
}

async function finish(
  source: Source | null,
  citation: CitationDraft | Readonly<Record<string, unknown>> | undefined,
  services: Pick<SourceAdditionServices, "workspace">,
  provenance?: CslProvenance,
): Promise<SourceAdditionOutcome> {
  if (!source) {
    return { kind: "not-added" };
  }
  const evidence = provenance ? { provenance } : {};
  const save = services.workspace.saveNewSourceCitation;
  if (!citation || !save || source.citation) {
    return { kind: "added", source, notices: [], ...evidence };
  }
  // A candidate's placeholder citekey is replaced with one unique in the collection.
  const fields = Object.fromEntries(Object.entries(citation).filter(([key]) => key !== "id"));
  try {
    const saved = provenance ? await save(source, fields, provenance) : await save(source, fields);
    return { kind: "added", source: saved, notices: [], ...evidence };
  } catch (reason) {
    return {
      kind: "added",
      source,
      ...evidence,
      notices: [
        `The citation was not stored: ${messageOf(reason)} Add it from the citation panel.`,
      ],
    };
  }
}

async function lookUpWork(
  ids: { readonly doi?: string; readonly arxiv?: string },
  services: SourceAdditionServices,
): Promise<CitationCandidate | null> {
  const request: CitationResolutionRequest | null = ids.doi
    ? { kind: "identifier", value: ids.doi }
    : ids.arxiv
      ? { kind: "identifier", value: `arxiv:${ids.arxiv}` }
      : null;
  if (!request) {
    return null;
  }
  services.onStatus("Looking up citation details…");
  return services.lookUp(request).catch(() => null);
}

/** Friendly source fields a citation implies. */
export function citationFields(citation: Readonly<Record<string, unknown>>): {
  readonly title?: string;
  readonly kind?: string;
  readonly metadata: SourceImportMetadata;
} {
  const draft = citation as CitationDraft;
  const title = stringField(citation, "title");
  const kind = sourceKindForCitation(citation);
  const year = citationYear(draft);
  const abstract = stringField(citation, "abstract");
  const authors = citationAuthors(draft);
  return {
    ...(title ? { title } : {}),
    ...(kind ? { kind } : {}),
    metadata: {
      ...(authors.length ? { authors } : {}),
      ...(year ? { published: String(year) } : {}),
      ...(abstract ? { description: abstract } : {}),
    },
  };
}

/** The citation's structured authors win over a page's byline. */
function authorsOf(fields: ReturnType<typeof citationFields> | undefined): SourceImportMetadata {
  return fields?.metadata.authors ? { authors: fields.metadata.authors } : {};
}

function stringField(
  citation: Readonly<Record<string, unknown>>,
  field: string,
): string | undefined {
  const value = citation[field];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function signalOf(services: { readonly signal?: AbortSignal }): { signal?: AbortSignal } {
  return services.signal ? { signal: services.signal } : {};
}

function messageOf(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
