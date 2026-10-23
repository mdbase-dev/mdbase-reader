import {
  annotationId,
  CitationChangedElsewhereError,
  citekeyForCitation,
  collectionId,
  cslValuesEqual,
  dateTime,
  fileId,
  fileRevision,
  loadedCitation,
  parseCslProvenance,
  recordRevision,
  sourceId,
  validateCslItem,
  type Annotation,
  type AnnotationCreationRequest,
  type AnnotationDeletionPlan,
  type CitationCandidate,
  type CitationResolutionRequest,
  type CslProvenance,
  type FileId,
  type ReadingPosition,
  type ReadingStatus,
  type Source,
  type SourceDeletionPlan,
  type SourceId,
  type SourceFileImportRequest,
  type SourceRecordCreationRequest,
  type SourceSummary,
} from "@mdbase-reader/core";
import { lazy, Suspense, useMemo, type JSX } from "react";

import { captureCitationProvenance } from "./capture-citation-provenance.js";
import { CollectionSwitchingContext, type CollectionSwitching } from "./CollectionPicker.js";
import {
  applyLibraryViewConfiguration,
  defaultLibraryView,
  defaultLibraryViewConfiguration,
  type ExecutedLibraryView,
  type LibraryViewSaveRequest,
  type MdbaseLibraryView,
} from "./mdbase-library-views.js";
import { ReaderApp } from "./ReaderApp.js";

import type { ReaderLibrarySnapshot, ReaderWorkspaceGateway } from "./workspace-model.js";
import type { ReadingSurface, SurfaceDocument } from "@mdbase-reader/reading-surface";

const collection = collectionId("reader-preview");
const previewDocument = {
  fileId: fileId("file_james_html"),
  file: "[[files/principles-of-psychology.html]]",
  revision: fileRevision("sha256:19e81c"),
};
const previewCitation = {
  id: "james1890principles",
  type: "book",
  title: "The Principles of Psychology",
  author: [{ family: "James", given: "William" }],
};
const sources: readonly Source[] = [
  {
    collectionId: collection,
    id: sourceId("src_james"),
    path: "sources/principles-of-psychology.md",
    title: "The Principles of Psychology",
    creators: ["William James"],
    tags: ["psychology", "attention"],
    citation: previewCitation,
    cslProvenance: {
      title: {
        value: previewCitation.title,
        source: "page:html",
        agreed: ["page:json-ld name", "h1"],
        rejected: [{ value: "Psychology", from: "page:json-ld headline" }],
      },
      language: { value: "en", source: "page:json-ld" },
    },
    readingStatus: "reading",
    reading: {
      status: "reading",
      progress: 0.42,
      lastOpenedAt: dateTime("2026-09-23T20:15:00+10:00"),
    },
    published: 1890,
    documents: [
      {
        fileId: previewDocument.fileId,
        file: previewDocument.file,
        revision: previewDocument.revision,
        mediaType: "text/html",
        role: "primary",
        title: "Saved page",
      },
    ],
    properties: {
      id: "src_james",
      title: "The Principles of Psychology",
      course: "[[courses/psych-attention|Psychology of attention]]",
      priority: 1,
    },
    body: "## Notes\n\nJames treats attention as selection: experience is what we agree to attend to.\n\n![[annotations/ann_attention]]\n",
    recordRevision: recordRevision("preview-revision-1"),
    frontmatter: { csl: previewCitation },
  },
  {
    collectionId: collection,
    id: sourceId("src_tufte"),
    path: "sources/visual-display.md",
    title: "The Visual Display of Quantitative Information",
    creators: ["Edward Tufte"],
    tags: ["design", "visualisation"],
    readingStatus: "queued",
    reading: { status: "queued", lastOpenedAt: dateTime("2026-09-18T09:02:00+10:00") },
    published: 1983,
    documents: [
      {
        fileId: fileId("file_tufte_epub"),
        file: "[[files/visual-display.epub]]",
        revision: fileRevision("sha256:ca102f"),
        mediaType: "application/epub+zip",
        role: "primary",
      },
    ],
    properties: {
      id: "src_tufte",
      title: "The Visual Display of Quantitative Information",
      priority: 3,
    },
    body: "## Questions\n\nHow does graphical integrity apply to interactive systems?",
    recordRevision: recordRevision("preview-revision-2"),
    frontmatter: {},
  },
  {
    collectionId: collection,
    id: sourceId("src_thoreau"),
    path: "sources/walden.md",
    title: "Walden; or, Life in the Woods",
    creators: ["Henry David Thoreau"],
    tags: ["attention"],
    readingStatus: "finished",
    documents: [],
    properties: {
      id: "src_thoreau",
      title: "Walden; or, Life in the Woods",
      course: "[[courses/psych-attention|Psychology of attention]]",
      priority: 2,
    },
    body: "Read alongside James.",
    recordRevision: recordRevision("preview-revision-3"),
    frontmatter: {},
  },
];

const annotations: readonly Annotation[] = [
  {
    collectionId: collection,
    id: annotationId("ann_attention"),
    sourceId: sourceId("src_james"),
    source: "[[src_james|The Principles of Psychology]]",
    document: previewDocument,
    annotationType: "highlight",
    locator: { label: "Chapter XI" },
    target: {
      quote: {
        exact:
          "It is the taking possession by the mind, in clear and vivid form, of one out of what seem several simultaneously possible objects or trains of thought.",
      },
      html: { css: "body" },
    },
    tags: ["attention"],
    body: "James's definition, and the ground of his account of study.",
    createdAt: dateTime("2026-08-09T14:21:00+10:00"),
  },
  {
    collectionId: collection,
    id: annotationId("ann_selection"),
    sourceId: sourceId("src_james"),
    source: "[[src_james|The Principles of Psychology]]",
    annotationType: "note",
    locator: { label: "Chapter XI" },
    tags: [],
    body: "Compare Thoreau on living deliberately.",
    createdAt: dateTime("2026-08-08T11:03:00+10:00"),
  },
  {
    collectionId: collection,
    id: annotationId("ann_chaos"),
    sourceId: sourceId("src_james"),
    source: "[[src_james|The Principles of Psychology]]",
    document: previewDocument,
    annotationType: "highlight",
    locator: { label: "Chapter XI" },
    target: {
      quote: { exact: "without selective interest, experience is an utter chaos" },
      html: { css: "body" },
    },
    tags: [],
    body: "",
    createdAt: dateTime("2026-08-10T09:40:00+10:00"),
  },
];

export class PreviewGateway implements ReaderWorkspaceGateway {
  #sources = sources.map(withRecordFrontmatter);
  #annotations = [...annotations];
  #views: MdbaseLibraryView[] = [
    defaultLibraryView,
    {
      ...defaultLibraryView,
      key: "preview/reading.md::reading",
      path: "preview/reading.md",
      revision: "preview-view-1",
      viewId: "reading",
      name: "Currently reading",
      writable: true,
      owned: true,
      configuration: {
        ...defaultLibraryViewConfiguration,
        filter: { ...defaultLibraryViewConfiguration.filter, status: "reading" },
      },
    },
    {
      ...defaultLibraryView,
      key: "preview/cards.md::visual-library",
      path: "preview/cards.md",
      revision: "preview-view-2",
      viewId: "visual-library",
      name: "Visual library",
      writable: true,
      owned: true,
      configuration: { ...defaultLibraryViewConfiguration, presentation: "cards" },
    },
  ];

  library(): Promise<ReaderLibrarySnapshot> {
    return Promise.resolve({
      collectionName: "Reading",
      sources: this.#sources,
      connectionState: "connected",
    });
  }
  listLibraryViews(): Promise<readonly MdbaseLibraryView[]> {
    return Promise.resolve(this.#views);
  }
  executeLibraryView(view: MdbaseLibraryView): Promise<ExecutedLibraryView> {
    const visible = applyLibraryViewConfiguration(this.#sources, view.configuration);
    return Promise.resolve({
      sources: visible,
      valuesByPath: new Map(),
      totalCount: visible.length,
    });
  }
  saveLibraryView(request: LibraryViewSaveRequest): Promise<MdbaseLibraryView> {
    const slug = request.name
      .trim()
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/gu, "-");
    const saved: MdbaseLibraryView = {
      key: request.existing?.key ?? `preview/${slug}.md::${slug}`,
      path: request.existing?.path ?? `preview/${slug}.md`,
      revision: `preview-view-${String(this.#views.length + 1)}`,
      viewId: request.existing?.viewId ?? slug,
      name: request.name.trim(),
      writable: true,
      owned: true,
      properties: [],
      configuration: request.configuration,
      ...(request.annotations ? { annotations: request.annotations } : {}),
    };
    this.#views = [...this.#views.filter(({ key }) => key !== saved.key), saved];
    return Promise.resolve(saved);
  }
  #sourceAnnotationsView = false;
  ensureSourceAnnotationsView(): Promise<{ readonly path: string; readonly created: boolean }> {
    const created = !this.#sourceAnnotationsView;
    this.#sourceAnnotationsView = true;
    return Promise.resolve({ path: "views/annotations-for-this-source.md", created });
  }
  source(id: SourceId): Promise<Source | null> {
    return Promise.resolve(this.#sources.find((source) => source.id === id) ?? null);
  }
  annotations(id: SourceId): Promise<readonly Annotation[]> {
    return Promise.resolve(this.#annotations.filter(({ sourceId: source }) => source === id));
  }
  allAnnotations(): Promise<readonly Annotation[]> {
    return Promise.resolve([...this.#annotations]);
  }
  annotationCounts(): Promise<ReadonlyMap<SourceId, number>> {
    const counts = new Map<SourceId, number>();
    for (const annotation of this.#annotations) {
      counts.set(annotation.sourceId, (counts.get(annotation.sourceId) ?? 0) + 1);
    }
    return Promise.resolve(counts);
  }
  saveSourceBody(source: Source, body: string): Promise<Source> {
    this.#sources = this.#sources.map((item) => (item.id === source.id ? { ...item, body } : item));
    return Promise.resolve(this.#sources.find((item) => item.id === source.id) ?? source);
  }
  saveSourceCitation(
    source: Source,
    citation: unknown,
    options: Parameters<ReaderWorkspaceGateway["saveSourceCitation"]>[2] = {},
  ): Promise<Source> {
    const current = this.#sources.find((item) => item.id === source.id) ?? source;
    if (
      "expectedCitation" in options &&
      !cslValuesEqual(loadedCitation(current) ?? null, options.expectedCitation ?? null)
    ) {
      return Promise.reject(
        new CitationChangedElsewhereError(
          loadedCitation(current),
          current.cslProvenance ?? parseCslProvenance(current.frontmatter["csl-provenance"]),
        ),
      );
    }
    const validation = validateCslItem(citation);
    if (!validation.valid) {
      return Promise.reject(new Error("The preview citation is invalid."));
    }
    const updated: Source = {
      ...current,
      citation: validation.item,
      ...(options.provenance ? { cslProvenance: options.provenance } : {}),
      frontmatter: {
        ...current.frontmatter,
        csl: validation.item,
        ...(options.provenance ? { "csl-provenance": options.provenance } : {}),
      },
    };
    if (options.provenance !== undefined && Object.keys(options.provenance).length === 0) {
      Reflect.deleteProperty(updated.frontmatter, "csl-provenance");
      Reflect.deleteProperty(updated, "cslProvenance");
    }
    const saved: Source = { ...updated, properties: updated.frontmatter };
    this.#sources = this.#sources.map((item) => (item.id === source.id ? saved : item));
    return Promise.resolve(saved);
  }
  resolveCitation(request: CitationResolutionRequest): Promise<CitationCandidate> {
    return Promise.resolve({
      citation: {
        id: "james1890principles",
        type: "book",
        title: "The Principles of Psychology",
        author: [{ family: "James", given: "William" }],
        issued: { "date-parts": [[1890]] },
        publisher: "Henry Holt and Company",
        "publisher-place": "New York",
        language: "en",
      },
      provenance: {
        provider: "Zotero Translation Server (preview)",
        query: request.value,
        retrievedAt: "2026-08-10T00:00:00.000Z",
      },
      warnings: [],
    });
  }
  searchText(): Promise<readonly []> {
    return Promise.resolve([]);
  }
  readFile(): Promise<never> {
    return Promise.reject(new Error("Preview files cannot be exported."));
  }
  importSourceFile(_request: Omit<SourceFileImportRequest, "collectionId">): Promise<Source> {
    return Promise.reject(new Error("File import is unavailable in the interface preview."));
  }
  /** Sources without a document need no file storage, so the preview can hold them. */
  createSource(request: Omit<SourceRecordCreationRequest, "collectionId">): Promise<Source> {
    const id = sourceId(`preview-added-${String(this.#sources.length + 1)}`);
    const source = withRecordFrontmatter({
      collectionId: collection,
      id,
      path: `sources/${id}.md`,
      title: request.title,
      creators: request.metadata?.authors ?? [],
      tags: [],
      ...(request.kind ? { kind: request.kind } : {}),
      ...(request.metadata?.published ? { published: request.metadata.published } : {}),
      ...(request.url ? { url: request.url } : {}),
      documents: [],
      body: `# ${request.title}\n`,
      recordRevision: recordRevision(`preview-${id}`),
      frontmatter: { ...(request.kind ? { kind: request.kind } : {}) },
    });
    this.#sources = [source, ...this.#sources];
    return Promise.resolve(source);
  }
  saveNewSourceCitation(
    source: Source,
    citation: Readonly<Record<string, unknown>>,
    provenance?: CslProvenance,
  ): Promise<Source> {
    return this.saveSourceCitation(
      source,
      { ...citation, id: citekeyForCitation(citation, this.#sources, source.id) },
      provenance !== undefined
        ? { provenance: captureCitationProvenance(citation, provenance) }
        : {},
    );
  }
  createAnnotation(request: AnnotationCreationRequest): Promise<Annotation> {
    const annotation: Annotation = {
      ...request,
      id: annotationId(`preview-${String(this.#annotations.length + 1)}`),
      createdAt: dateTime(new Date().toISOString()),
    };
    this.#annotations.unshift(annotation);
    return Promise.resolve(annotation);
  }
  updateAnnotation(annotation: Annotation, body: string): Promise<Annotation> {
    const updated = {
      ...annotation,
      body,
      modifiedAt: dateTime(new Date().toISOString()),
    };
    this.#annotations = this.#annotations.map((candidate) =>
      candidate.id === updated.id ? updated : candidate,
    );
    return Promise.resolve(updated);
  }
  planAnnotationDeletion(annotation: Annotation): Promise<AnnotationDeletionPlan> {
    const source = this.#sources.find(({ id }) => id === annotation.sourceId);
    return Promise.resolve({
      annotationId: annotation.id,
      path: annotation.path ?? `annotations/${annotation.id}.md`,
      expectedRevision: annotation.recordRevision ?? recordRevision(`preview-${annotation.id}`),
      brokenLinkPaths:
        source?.body.includes(`annotations/${annotation.id}`) === true ? [source.path] : [],
    });
  }
  deleteAnnotation(annotation: Annotation): Promise<void> {
    this.#annotations = this.#annotations.filter((candidate) => candidate.id !== annotation.id);
    return Promise.resolve();
  }
  planSourceRemoval(id: SourceId): Promise<SourceDeletionPlan> {
    const source = this.#sources.find((item) => item.id === id);
    if (!source) {
      return Promise.reject(new Error("This source is no longer in the collection."));
    }
    return Promise.resolve({
      sourceId: id,
      path: source.path,
      expectedRevision: source.recordRevision,
      brokenLinkPaths: this.#annotations
        .filter((annotation) => annotation.sourceId === id)
        .map((annotation) => annotation.path ?? `annotations/${annotation.id}.md`),
    });
  }
  removeSource(plan: SourceDeletionPlan): Promise<void> {
    this.#sources = this.#sources.filter((item) => item.id !== plan.sourceId);
    return Promise.resolve();
  }
  transcludeAnnotation(source: Source, annotation: Annotation): Promise<Source> {
    const embed = `![[${annotation.path?.replace(/\.md$/u, "") ?? `annotations/${annotation.id}`}]]`;
    return this.saveSourceBody(source, `${source.body.trimEnd()}\n\n${embed}\n`);
  }
  saveReadingPosition(
    source: Source,
    _documentFileId: FileId,
    _position: ReadingPosition,
  ): Promise<Source> {
    return Promise.resolve(source);
  }
  saveSourceFields(id: SourceId, fields: Readonly<Record<string, unknown>>): Promise<Source> {
    const source = this.#sources.find((item) => item.id === id);
    if (!source) {
      return Promise.reject(new Error("The preview source no longer exists."));
    }
    const frontmatter: Record<string, unknown> = { ...source.frontmatter };
    for (const [key, value] of Object.entries(fields)) {
      if (value === null) {
        Reflect.deleteProperty(frontmatter, key);
      } else {
        frontmatter[key] = value;
      }
    }
    const updated: { -readonly [Key in keyof Source]: Source[Key] } = {
      ...source,
      title: typeof frontmatter["title"] === "string" ? frontmatter["title"] : source.title,
      creators: Array.isArray(frontmatter["authors"])
        ? frontmatter["authors"].filter((author) => typeof author === "string")
        : [],
      frontmatter,
      properties: frontmatter,
    };
    Reflect.deleteProperty(updated, "published");
    Reflect.deleteProperty(updated, "url");
    const published = frontmatter["published"];
    if (typeof published === "string" || typeof published === "number") {
      updated.published = published;
    }
    if (typeof frontmatter["url"] === "string") {
      updated.url = frontmatter["url"];
    }
    this.#sources = this.#sources.map((item) => (item.id === id ? updated : item));
    return Promise.resolve(updated);
  }
  saveReadingStatus(id: SourceId, status: ReadingStatus): Promise<Source> {
    const source = this.#sources.find((item) => item.id === id);
    if (!source) {
      return Promise.reject(new Error("The preview source no longer exists."));
    }
    const updated: Source = {
      ...source,
      readingStatus: status,
      reading: { ...source.reading, status },
    };
    this.#sources = this.#sources.map((item) => (item.id === id ? updated : item));
    return Promise.resolve(updated);
  }
}

const HtmlViewerSurface = lazy(async () => {
  const module = await import("@mdbase-reader/renderer-html");
  return { default: module.HtmlViewerSurface };
});

const previewHtml = `<!doctype html><html lang="en"><head><title>The Principles of Psychology</title></head><body>
<article>
<h1>Chapter XI. Attention</h1>
<p>Millions of items of the outward order are present to my senses which never properly enter into my experience. Why? Because they have no interest for me. My experience is what I agree to attend to. Only those items which I notice shape my mind—without selective interest, experience is an utter chaos.</p>
<p>Everyone knows what attention is. It is the taking possession by the mind, in clear and vivid form, of one out of what seem several simultaneously possible objects or trains of thought.</p>
<p>Focalization, concentration, of consciousness are of its essence. It implies withdrawal from some things in order to deal effectively with others.</p>
<p>And the faculty of voluntarily bringing back a wandering attention, over and over again, is the very root of judgment, character, and will.</p>
</article>
</body></html>`;
// A data URL has no lifetime to manage across StrictMode's remounts.
const previewUrl = `data:text/html;charset=utf-8,${encodeURIComponent(previewHtml)}`;

function PreviewDocument({
  source,
  onSurfaceChange,
}: {
  readonly source: SourceSummary;
  readonly onSurfaceChange: (surface: ReadingSurface | null) => void;
}): JSX.Element {
  const document = useMemo<SurfaceDocument>(
    () => ({ document: previewDocument, mediaType: "text/html", url: previewUrl }),
    [],
  );
  if (source.id !== sourceId("src_james")) {
    return (
      <div className="preview-document">
        <div className="document-message">
          <strong>{source.title}</strong>
          <span>
            The interface preview includes one sample document: The Principles of Psychology.
          </span>
        </div>
      </div>
    );
  }
  return (
    <div className="preview-document is-rendered" aria-label="Interface preview document">
      <Suspense fallback={null}>
        <HtmlViewerSurface
          className="html-viewer"
          document={document}
          onSurfaceReady={onSurfaceChange}
        />
      </Suspense>
      <div className="preview-notice">
        <span>Interface preview</span> No collection records or files are created.
      </div>
    </div>
  );
}

export function PreviewReader(): JSX.Element {
  const gateway = useMemo(() => new PreviewGateway(), []);
  return (
    <CollectionSwitchingContext value={previewCollections}>
      <ReaderApp
        gateway={gateway}
        renderDocument={(source, onSurfaceChange) => (
          <PreviewDocument source={source} onSurfaceChange={onSurfaceChange} />
        )}
        saveFile={() => Promise.resolve()}
      />
    </CollectionSwitchingContext>
  );
}

/** Sample collections show the switcher; the preview has only its own records to open. */
const previewCollections: CollectionSwitching = {
  collectionId: collection,
  connections: [
    { collectionId: collection, displayName: "Reading", authority: { kind: "hosted" } },
    {
      collectionId: "preview-thesis",
      displayName: "Thesis research",
      authority: { kind: "connector" },
    },
    {
      collectionId: "preview-course",
      displayName: "Course reading",
      authority: { kind: "hosted" },
    },
  ],
  select: () => {
    throw new Error(
      "The preview has one sample collection. Connect mdbase to switch between yours.",
    );
  },
  connect: () =>
    Promise.reject(new Error("Connecting a collection needs mdbase Connect, outside the preview.")),
};

/** Preview records list friendly fields on the summary; a real record stores them as frontmatter. */
function withRecordFrontmatter(source: Source): Source {
  const frontmatter = {
    id: source.id,
    title: source.title,
    ...(source.creators.length ? { authors: source.creators } : {}),
    ...(source.published !== undefined ? { published: source.published } : {}),
    ...(source.url ? { url: source.url } : {}),
    ...source.properties,
    ...source.frontmatter,
  };
  return { ...source, frontmatter, properties: frontmatter };
}
