import {
  createAnnotation,
  deleteAnnotation,
  planAnnotationDeletion,
  updateAnnotationBody,
  annotationId,
  mutationId,
  importSourceFile,
  matchTextQuote,
  sourceLink,
  textQuoteAt,
  type Annotation,
  type AnnotationDeletionPlan,
  type AnnotationId,
  type DocumentDescriptor,
  type MutationId,
  type QuoteSelector,
  type Source,
  type SourceFileImportRequest,
  type SourceImportMetadata,
  type SourceImportProgress,
  type SourceSummary,
} from "@mdbase-reader/core";
import { createReaderRuntimeServices, type KeyValueStorage } from "@mdbase-reader/platform";
import { citationAuthors, citationYear, webCaptureImport } from "@mdbase-reader/web-capture";

import {
  citekeyNeighbours,
  parsedCaptureHtml,
  saveCaptureCitation,
  type CitationPreview,
} from "./capture-citation.js";
import { sourceForUrl } from "./capture-model.js";
import { highlightBody, withHighlightComment } from "./highlight-body.js";
import { pageText } from "./page-annotations.js";
import { rememberSavedUrls } from "./saved-url-index.js";

import type { PageCapture, PdfCapture, SelectedWebCapture } from "./page-capture.js";
import type { ReaderConnectedCollection, ReaderPortableSession } from "@mdbase-reader/connect";

export const highlightColors = ["yellow", "green", "blue", "pink", "purple"] as const;
export type HighlightColor = (typeof highlightColors)[number];

export interface CaptureDraft {
  readonly title: string;
  readonly tags: string;
  readonly note: string;
  readonly comment: string;
  readonly highlight: boolean;
  readonly color: HighlightColor;
  readonly highlightTags: string;
}
export interface SavedCapture {
  readonly source: SourceSummary;
  readonly existing: boolean;
  readonly annotation: Annotation | null;
  /** Parts that did not complete although the source itself is saved. */
  readonly notices: readonly string[];
}
export interface SaveCaptureInput {
  readonly session: ReaderPortableSession;
  readonly collection: ReaderConnectedCollection;
  readonly capture: PageCapture;
  readonly draft: CaptureDraft;
  /** A source the panel already found for this page; skips a second lookup. */
  readonly known?: SourceSummary | null;
  /**
   * `known` is the settled result of the panel's URL lookup for this page and collection, so
   * `null` means no source was found and the lookup is not repeated. Without it, `null` means
   * "not looked up yet". An interrupted import is always looked up again.
   */
  readonly lookedUp?: boolean;
  readonly citation?: CitationPreview | null;
  readonly pdfBytes?: () => Promise<Uint8Array>;
  readonly onSource: (source: SourceSummary, existing: boolean) => void;
  readonly onProgress: (progress: SourceImportProgress) => void;
}

/** Saved reading copies' text, so repeated highlights on one page do not download it again. */
const savedTextLimit = 4;

/** A saved source with the reading copy this save just uploaded, when it created the source. */
interface CreatedSource {
  readonly source: Source;
  readonly readable: Uint8Array | null;
}

/** One explicit save at a time; annotation retries retain their identity. */
export class CaptureWriter {
  readonly #runtime;
  readonly #annotations = new Map<string, { id: AnnotationId; mutation: MutationId }>();
  /** Keyed by the exact stored revision, so a changed copy is never matched from here. */
  readonly #savedTexts = new Map<string, string>();

  constructor(private readonly journalStorage: KeyValueStorage) {
    this.#runtime = createReaderRuntimeServices(journalStorage);
  }

  async save(input: SaveCaptureInput): Promise<SavedCapture> {
    const { session, collection, capture, draft, onSource } = input;
    const outcomes = await session.recoverPendingMutations();
    const failure = outcomes.find((outcome) => !outcome.ok);
    if (failure) {
      throw new Error(failure.problem.message);
    }
    const notices: string[] = [];
    const recoveryKey = importRecoveryKey(input);
    // An import that was interrupted may have committed after the panel looked.
    const interrupted = (await this.journalStorage.get(recoveryKey)) !== null;
    const lookUp =
      input.known === undefined || (input.known === null && (!input.lookedUp || interrupted));
    const found =
      input.known ??
      (lookUp
        ? await sourceForUrl(collection, capture.canonicalUrl, [capture.submittedUrl])
        : null);
    const existing = Boolean(found);
    let source: SourceSummary;
    let created: CreatedSource | null = null;
    if (found) {
      source = found;
    } else {
      created = await this.#create(input, notices, interrupted);
      source = created.source;
    }
    if (found && interrupted) {
      await this.journalStorage.remove(recoveryKey);
    }
    onSource(source, existing);
    // The toolbar mark for saved pages need not wait for its next index rebuild.
    void rememberSavedUrls(collection.collectionId, [capture.canonicalUrl, capture.submittedUrl]);
    const annotation =
      draft.highlight && capture.kind === "html" && capture.selection
        ? await this.#highlight(collection, created ?? source, capture.selection, draft)
        : null;
    return { source, existing, annotation, notices };
  }

  async #create(
    input: SaveCaptureInput,
    notices: string[],
    recoverExistingFiles: boolean,
  ): Promise<CreatedSource> {
    const { collection, capture, draft, citation } = input;
    // The citekey lookup does not depend on the new source; fetch it while the page imports.
    const neighbours = citation ? citekeyNeighbours(collection, citation.citation) : null;
    neighbours?.catch(() => undefined);
    const request =
      capture.kind === "html" ? await htmlRequest(capture) : await pdfRequest(capture, input);
    const title = draft.title.trim() || request.title;
    const tags = draft.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    // Only interrupted imports need an expensive scan for orphaned uploads.
    // Persist before writing so closing/reopening the panel retains safe recovery.
    const recoveryKey = importRecoveryKey(input);
    await this.journalStorage.set(recoveryKey, "pending");
    let source = await importSourceFile(
      { ...this.#runtime, imports: collection.sourceImports },
      {
        ...request,
        collectionId: collection.collectionId,
        title,
        tags,
        ...(citation ? { metadata: withCitation(request.metadata, citation) } : {}),
        ...(draft.note.trim() ? { body: `# ${title}\n\n${draft.note}\n` } : {}),
      },
      { recoverExistingFiles, onProgress: input.onProgress },
    );
    await this.journalStorage.remove(recoveryKey);
    if (citation && neighbours) {
      try {
        source = await saveCaptureCitation(collection, source, citation.citation, neighbours);
      } catch (reason) {
        notices.push(
          `The citation was not stored: ${reason instanceof Error ? reason.message : String(reason)}. Add it from the source's citation panel in Reader.`,
        );
      }
    }
    return { source, readable: request.bytes };
  }

  async #highlight(
    collection: ReaderConnectedCollection,
    saved: SourceSummary | CreatedSource,
    selection: QuoteSelector,
    draft: CaptureDraft,
  ): Promise<Annotation> {
    // A source this save created is current as returned; others are read for their revision.
    const created = "readable" in saved ? saved : null;
    const source =
      "readable" in saved
        ? saved.source
        : await collection.sources.get(collection.collectionId, saved.id);
    if (!source) {
      throw new Error(
        "The saved source is no longer available. Your highlight has not been saved.",
      );
    }
    const comment = draft.comment;
    const key = JSON.stringify([
      collection.collectionId,
      source.id,
      selection,
      comment,
      draft.color,
      draft.highlightTags,
    ]);
    const recoveryKey = `capture-annotation:${await this.#runtime.hasher.sha256(new TextEncoder().encode(key))}`;
    const previous =
      this.#annotations.get(key) ?? (await readHighlightIdentity(this.journalStorage, recoveryKey));
    const identity = previous ?? {
      id: this.#runtime.ids.annotation(),
      mutation: this.#runtime.ids.mutation(),
    };
    if (previous) {
      const recovered = await collection.annotations.get(collection.collectionId, identity.id);
      if (recovered) {
        if (
          recovered.sourceId !== source.id ||
          recovered.collectionId !== collection.collectionId
        ) {
          throw new Error(
            "The recovered highlight belongs to a different source. Review it before retrying; no duplicate was created.",
          );
        }
        await this.journalStorage.remove(recoveryKey);
        return recovered;
      }
    }
    this.#annotations.set(key, identity);
    const { document, quote } = await this.#savedTarget(
      collection,
      source,
      selection,
      created?.readable ?? null,
    );
    await this.journalStorage.set(recoveryKey, JSON.stringify(identity));
    const result = await createAnnotation(
      {
        ...this.#runtime,
        ids: {
          ...this.#runtime.ids,
          annotation: () => identity.id,
          mutation: () => identity.mutation,
        },
        sources: collection.sources,
        annotations: collection.annotations,
      },
      {
        collectionId: collection.collectionId,
        sourceId: source.id,
        source: sourceLink(source),
        sourceRecord: source,
        document,
        annotationType: "highlight",
        motivation: comment.trim() ? "commenting" : "highlighting",
        color: draft.color,
        tags: [
          ...new Set(
            draft.highlightTags
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean),
          ),
        ],
        target: { quote },
        body: highlightBody(quote.exact, comment),
      },
    );
    await this.journalStorage.remove(recoveryKey);
    return result.annotation;
  }

  /** Changes a saved highlight's comment; its quote stays as saved. */
  updateComment(
    collection: ReaderConnectedCollection,
    annotation: Annotation,
    comment: string,
  ): Promise<Annotation> {
    return updateAnnotationBody(
      collection.annotations,
      annotation,
      withHighlightComment(annotation.body, comment),
      this.#runtime.clock.now(),
    );
  }

  /** What deleting would affect, such as notes that link to the highlight. */
  planDeletion(
    collection: ReaderConnectedCollection,
    annotation: Annotation,
  ): Promise<AnnotationDeletionPlan> {
    return planAnnotationDeletion(collection.annotations, annotation);
  }

  delete(
    collection: ReaderConnectedCollection,
    annotation: Annotation,
    plan: AnnotationDeletionPlan,
  ): Promise<void> {
    return deleteAnnotation(collection.annotations, annotation, plan);
  }

  async #savedTarget(
    collection: ReaderConnectedCollection,
    source: Source,
    selection: QuoteSelector,
    uploaded: Uint8Array | null,
  ): Promise<{ document: DocumentDescriptor; quote: QuoteSelector }> {
    const document = source.documents.find(
      (item) => ["primary", "readable"].includes(item.role) && item.mediaType === "text/html",
    );
    if (!document) {
      throw new Error("This source has no saved HTML reading copy. Open it in Reader to annotate.");
    }
    const text = await this.#savedText(collection, source, document, uploaded);
    const match = matchTextQuote(text, selection);
    if (!match || match.ambiguous) {
      throw new Error(
        "This passage is missing or ambiguous in the saved copy. The source is saved, but the highlight is not. Open the saved copy in Reader to select it there.",
      );
    }
    // Stored as the saved copy reads, which is where Reader anchors it.
    return { document, quote: textQuoteAt(text, match.start, match.end) };
  }

  /** The reading copy's text at exactly `document.revision`, verified against its digest. */
  async #savedText(
    collection: ReaderConnectedCollection,
    source: Source,
    document: DocumentDescriptor,
    uploaded: Uint8Array | null,
  ): Promise<string> {
    const key = JSON.stringify([
      collection.collectionId,
      source.id,
      document.file,
      document.revision,
    ]);
    const cached = this.#savedTexts.get(key);
    if (cached !== undefined) {
      this.#savedTexts.delete(key);
      this.#savedTexts.set(key, cached);
      return cached;
    }
    // The bytes this save uploaded are the stored copy only if they hash to its revision.
    const bytes =
      uploaded && (await this.#runtime.hasher.sha256(uploaded)) === document.revision
        ? uploaded
        : await this.#downloadVerified(collection, document);
    const parsed = new DOMParser().parseFromString(new TextDecoder().decode(bytes), "text/html");
    const text = pageText({ action: "text" }, parsed).text ?? "";
    this.#savedTexts.set(key, text);
    for (const oldest of this.#savedTexts.keys()) {
      if (this.#savedTexts.size <= savedTextLimit) {
        break;
      }
      this.#savedTexts.delete(oldest);
    }
    return text;
  }

  async #downloadVerified(
    collection: ReaderConnectedCollection,
    document: DocumentDescriptor,
  ): Promise<Uint8Array> {
    const saved = await collection.files.read(
      collection.collectionId,
      document.file,
      document.revision,
    );
    if ((await this.#runtime.hasher.sha256(saved.bytes)) !== document.revision) {
      throw new Error(
        "The saved document changed. Open the saved copy in Reader; no highlight was created.",
      );
    }
    return saved.bytes;
  }
}

function importRecoveryKey({ collection, capture }: SaveCaptureInput): string {
  return `capture-import:${collection.collectionId}:${capture.canonicalUrl}`;
}

async function readHighlightIdentity(
  storage: KeyValueStorage,
  key: string,
): Promise<{ id: AnnotationId; mutation: MutationId } | null> {
  const saved = await storage.get(key);
  if (saved === null) {
    return null;
  }
  const value: unknown = JSON.parse(saved);
  if (
    !value ||
    typeof value !== "object" ||
    !("id" in value) ||
    !("mutation" in value) ||
    typeof value.id !== "string" ||
    !value.id ||
    typeof value.mutation !== "string" ||
    !value.mutation
  ) {
    throw new Error(
      "The saved highlight recovery identity is invalid. No duplicate highlight was created.",
    );
  }
  return { id: annotationId(value.id), mutation: mutationId(value.mutation) };
}

type ImportParts = Omit<SourceFileImportRequest, "collectionId"> & { readonly title: string };

async function htmlRequest(capture: SelectedWebCapture): Promise<ImportParts> {
  // Reuses the parse made for the citation when the panel opened.
  const prepared = await webCaptureImport(capture, { document: parsedCaptureHtml(capture.html) });
  return {
    name: prepared.name,
    declaredMediaType: "text/html",
    bytes: prepared.bytes,
    title: prepared.title,
    archive: prepared.archive,
    capture: prepared.capture,
    metadata: prepared.metadata,
  };
}

async function pdfRequest(capture: PdfCapture, input: SaveCaptureInput): Promise<ImportParts> {
  if (!input.pdfBytes) {
    throw new Error(
      "Reader cannot download this PDF from here. Download it and import the file in Reader.",
    );
  }
  const bytes = await input.pdfBytes();
  const name = decodeURIComponent(new URL(capture.canonicalUrl).pathname.split("/").at(-1) ?? "");
  const title =
    typeof input.citation?.citation["title"] === "string"
      ? input.citation.citation["title"]
      : capture.pageTitle;
  return {
    name: /\.pdf$/iu.test(name) ? name : `${name || "document"}.pdf`,
    declaredMediaType: "application/pdf",
    bytes,
    title,
    metadata: { site: new URL(capture.canonicalUrl).hostname },
    // PDFs carry no web-capture provenance; where the file came from serves later URL lookups.
    url: capture.canonicalUrl,
  };
}

/** The citation's structured authors win; the page's own date and description are kept. */
function withCitation(
  page: SourceFileImportRequest["metadata"],
  preview: CitationPreview,
): SourceImportMetadata {
  const authors = citationAuthors(preview.citation);
  const year = citationYear(preview.citation);
  const abstract = preview.citation["abstract"];
  return {
    ...(year ? { published: String(year) } : {}),
    ...(typeof abstract === "string" ? { description: abstract } : {}),
    ...page,
    ...(authors.length ? { authors } : {}),
  };
}
