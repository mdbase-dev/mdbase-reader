/* eslint-disable max-lines */
import {
  annotationId,
  collectionId,
  dateTime,
  fileId,
  fileRevision,
  recordRevision,
  sourceId,
  validateCslItem,
  type Annotation,
  type AnnotationCreationRequest,
  type AnnotationDeletionPlan,
  type CitationCandidate,
  type CitationResolutionRequest,
  type FileId,
  type ReadingPosition,
  type ReadingStatus,
  type Source,
  type SourceId,
  type SourceFileImportRequest,
  type SourceSummary,
} from "@mdbase-reader/core";
import { lazy, Suspense, useMemo, type JSX } from "react";

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
  fileId: fileId("file_weil_html"),
  file: "[[files/gravity-and-grace.html]]",
  revision: fileRevision("sha256:19e81c"),
};
const previewCitation = {
  id: "weil1952gravity",
  type: "book",
  title: "Gravity and Grace",
  author: [{ family: "Weil", given: "Simone" }],
};
const sources: readonly Source[] = [
  {
    collectionId: collection,
    id: sourceId("src_weil"),
    path: "sources/gravity-and-grace.md",
    title: "Gravity and Grace",
    creators: ["Simone Weil"],
    tags: ["philosophy", "attention"],
    citation: previewCitation,
    readingStatus: "reading",
    reading: {
      status: "reading",
      progress: 0.42,
      lastOpenedAt: dateTime("2026-09-23T20:15:00+10:00"),
    },
    published: 1952,
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
      id: "src_weil",
      title: "Gravity and Grace",
      course: "[[courses/phil-attention|Philosophy of attention]]",
      priority: 1,
    },
    body: "## Notes\n\nAttention is not effort but a patient availability to truth.\n\n![[annotations/ann_attention]]\n",
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
    id: sourceId("src_crawford"),
    path: "sources/attention-as-cultural-problem.md",
    title: "Attention as a Cultural Problem",
    creators: ["Matthew B. Crawford"],
    tags: ["attention"],
    readingStatus: "finished",
    documents: [],
    properties: {
      id: "src_crawford",
      title: "Attention as a Cultural Problem",
      course: "[[courses/phil-attention|Philosophy of attention]]",
      priority: 2,
    },
    body: "Read alongside Weil.",
    recordRevision: recordRevision("preview-revision-3"),
    frontmatter: {},
  },
];

const annotations: readonly Annotation[] = [
  {
    collectionId: collection,
    id: annotationId("ann_attention"),
    sourceId: sourceId("src_weil"),
    source: "[[src_weil|Gravity and Grace]]",
    document: previewDocument,
    annotationType: "highlight",
    locator: { label: "Attention and Will" },
    target: {
      quote: {
        exact:
          "Attention consists of suspending our thought, leaving it detached, empty and ready to be penetrated by the object.",
      },
      html: { css: "body" },
    },
    tags: ["attention"],
    body: "This is the practical core of Weil's account of study.",
    createdAt: dateTime("2026-08-09T14:21:00+10:00"),
  },
  {
    collectionId: collection,
    id: annotationId("ann_contradiction"),
    sourceId: sourceId("src_weil"),
    source: "[[src_weil|Gravity and Grace]]",
    annotationType: "note",
    locator: { label: "Introduction" },
    tags: [],
    body: "Compare this with the note on contradiction in the introduction.",
    createdAt: dateTime("2026-08-08T11:03:00+10:00"),
  },
  {
    collectionId: collection,
    id: annotationId("ann_hastily"),
    sourceId: sourceId("src_weil"),
    source: "[[src_weil|Gravity and Grace]]",
    document: previewDocument,
    annotationType: "highlight",
    locator: { label: "Attention and Will" },
    target: {
      quote: { exact: "thought has seized upon some idea too hastily" },
      html: { css: "body" },
    },
    tags: [],
    body: "",
    createdAt: dateTime("2026-08-10T09:40:00+10:00"),
  },
];

export class PreviewGateway implements ReaderWorkspaceGateway {
  #sources = [...sources];
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
  saveSourceCitation(source: Source, citation: unknown): Promise<Source> {
    const validation = validateCslItem(citation);
    if (!validation.valid) {
      return Promise.reject(new Error("The preview citation is invalid."));
    }
    const updated: Source = {
      ...source,
      citation: validation.item,
      frontmatter: { ...source.frontmatter, csl: validation.item },
    };
    this.#sources = this.#sources.map((item) => (item.id === source.id ? updated : item));
    return Promise.resolve(updated);
  }
  resolveCitation(request: CitationResolutionRequest): Promise<CitationCandidate> {
    return Promise.resolve({
      citation: {
        id: "weil1952gravity",
        type: "book",
        title: "Gravity and Grace",
        author: [{ family: "Weil", given: "Simone" }],
        translator: [{ family: "Crawford", given: "Emma" }],
        issued: { "date-parts": [[1952]] },
        publisher: "Routledge and Kegan Paul",
        "publisher-place": "London",
        language: "en",
        ISBN: "9780415290012",
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
    const properties: Record<string, unknown> = { ...source.properties };
    for (const [key, value] of Object.entries(fields)) {
      if (value === null) {
        Reflect.deleteProperty(properties, key);
      } else {
        properties[key] = value;
      }
    }
    const updated: Source = { ...source, properties };
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

const previewHtml = `<!doctype html><html lang="en"><head><title>Gravity and Grace</title></head><body>
<article>
<h1>Attention and Will</h1>
<p>We do not have to acquire humility. There is humility in us—only we humiliate ourselves before false gods.</p>
<p>Attention consists of suspending our thought, leaving it detached, empty and ready to be penetrated by the object.</p>
<p>Thought must be empty, waiting, not seeking anything, but ready to receive in its naked truth the object that is to penetrate it.</p>
<p>All wrong translations, all absurdities in geometry problems, all clumsiness of style and all faulty connection of ideas in compositions and essays, all such things are due to the fact that thought has seized upon some idea too hastily.</p>
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
  if (source.id !== sourceId("src_weil")) {
    return (
      <div className="preview-document">
        <div className="document-message">
          <strong>{source.title}</strong>
          <span>The interface preview includes one sample document: Gravity and Grace.</span>
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
    <ReaderApp
      gateway={gateway}
      renderDocument={(source, onSurfaceChange) => (
        <PreviewDocument source={source} onSurfaceChange={onSurfaceChange} />
      )}
      saveFile={() => Promise.resolve()}
    />
  );
}
