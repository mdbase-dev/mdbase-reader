import {
  createAnnotation,
  importSourceFile,
  type Annotation,
  type AnnotationId,
  type DocumentDescriptor,
  type MutationId,
  type QuoteSelector,
  type Source,
  type SourceImportProgress,
  type SourceSummary,
} from "@mdbase-reader/core";
import { createReaderRuntimeServices } from "@mdbase-reader/platform";
import { webCaptureImport } from "@mdbase-reader/web-capture";

import { localStorageAdapter, sourceForUrl } from "./capture-model.js";
import { pageAnnotations } from "./page-annotations.js";

import type { SelectedWebCapture } from "./page-capture.js";
import type {
  ReaderConnectedCollection,
  ReaderPortableApplicationSession,
} from "@mdbase-reader/connect";

export interface CaptureDraft {
  readonly title: string;
  readonly tags: string;
  readonly note: string;
  readonly comment: string;
  readonly highlight: boolean;
}
export interface SavedCapture {
  readonly source: SourceSummary;
  readonly existing: boolean;
  readonly annotation: Annotation | null;
}

/** One explicit save at a time; annotation retries retain their identity. */
export class CaptureWriter {
  readonly #runtime = createReaderRuntimeServices(localStorageAdapter());
  readonly #annotations = new Map<string, { id: AnnotationId; mutation: MutationId }>();

  async save(input: {
    session: ReaderPortableApplicationSession;
    collection: ReaderConnectedCollection;
    capture: SelectedWebCapture;
    draft: CaptureDraft;
    onSource: (source: SourceSummary, existing: boolean) => void;
    onProgress: (progress: SourceImportProgress) => void;
  }): Promise<SavedCapture> {
    const { session, collection, capture, draft, onSource, onProgress } = input;
    const outcomes = await session.recoverPendingMutations();
    const failure = outcomes.find((outcome) => !outcome.ok);
    if (failure) {
      throw new Error(failure.problem.message);
    }
    let source = await sourceForUrl(collection, capture.canonicalUrl);
    const existing = Boolean(source);
    if (!source) {
      const prepared = await webCaptureImport(capture);
      source = await importSourceFile(
        { ...this.#runtime, imports: collection.sourceImports },
        {
          collectionId: collection.collectionId,
          name: prepared.name,
          declaredMediaType: "text/html",
          bytes: prepared.bytes,
          title: draft.title.trim() || prepared.title,
          archive: prepared.archive,
          capture: prepared.capture,
          metadata: prepared.metadata,
          tags: draft.tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
          ...(draft.note.trim()
            ? { body: `# ${draft.title.trim() || prepared.title}\n\n${draft.note}\n` }
            : {}),
        },
        { recoverExistingFiles: true, onProgress },
      );
    }
    onSource(source, existing);
    const annotation =
      draft.highlight && capture.selection
        ? await this.#highlight(collection, source, capture.selection, draft.comment)
        : null;
    return { source, existing, annotation };
  }

  async #highlight(
    collection: ReaderConnectedCollection,
    summary: SourceSummary,
    selection: QuoteSelector,
    comment: string,
  ): Promise<Annotation> {
    const source = await collection.sources.get(collection.collectionId, summary.id);
    if (!source) {
      throw new Error(
        "The saved source is no longer available. Your highlight has not been saved.",
      );
    }
    const key = JSON.stringify([collection.collectionId, source.id, selection, comment]);
    const identity = this.#annotations.get(key) ?? {
      id: this.#runtime.ids.annotation(),
      mutation: this.#runtime.ids.mutation(),
    };
    if (this.#annotations.has(key)) {
      const recovered = await collection.annotations.get(collection.collectionId, identity.id);
      if (recovered) {
        return recovered;
      }
    }
    this.#annotations.set(key, identity);
    const { document, quote } = await this.#savedTarget(collection, source, selection);
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
        source: `[[${source.path.replace(/\.md$/u, "")}]]`,
        sourceRecord: source,
        document,
        annotationType: "highlight",
        motivation: comment.trim() ? "commenting" : "highlighting",
        color: "yellow",
        tags: [],
        target: { quote },
        body: `${quote.exact
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n")}${comment.trim() ? `\n\n${comment}` : ""}`,
      },
    );
    return result.annotation;
  }

  async #savedTarget(
    collection: ReaderConnectedCollection,
    source: Source,
    selection: QuoteSelector,
  ): Promise<{ document: DocumentDescriptor; quote: QuoteSelector }> {
    const document = source.documents.find(
      (item) => ["primary", "readable"].includes(item.role) && item.mediaType === "text/html",
    );
    if (!document) {
      throw new Error("This source has no saved HTML reading copy. Open it in Reader to annotate.");
    }
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
    const parsed = new DOMParser().parseFromString(
      new TextDecoder().decode(saved.bytes),
      "text/html",
    );
    const quote = pageAnnotations({ action: "locate", quotes: [selection] }, parsed).quotes[0];
    if (!quote) {
      throw new Error(
        "This passage is missing or ambiguous in the saved copy. The source is saved, but the highlight is not. Open the saved copy in Reader to select it there.",
      );
    }
    return { document, quote };
  }
}
