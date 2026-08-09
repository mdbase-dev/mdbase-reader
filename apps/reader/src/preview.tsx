import {
  annotationId,
  collectionId,
  dateTime,
  fileId,
  fileRevision,
  recordRevision,
  sourceId,
  type Annotation,
  type Source,
  type SourceId,
} from "@mdbase-reader/core";
import { useMemo, type JSX } from "react";

import { ReaderApp } from "./ReaderApp.js";

import type { ReaderLibrarySnapshot, ReaderWorkspaceGateway } from "./workspace-model.js";

const collection = collectionId("reader-preview");
const sources: readonly Source[] = [
  {
    collectionId: collection,
    id: sourceId("src_weil"),
    path: "sources/gravity-and-grace.md",
    title: "Gravity and Grace",
    creators: ["Simone Weil"],
    tags: ["philosophy", "attention"],
    readingStatus: "reading",
    documents: [
      {
        fileId: fileId("file_weil_pdf"),
        file: "[[files/gravity-and-grace.pdf]]",
        revision: fileRevision("sha256:19e81c"),
        mediaType: "application/pdf",
        role: "primary",
        title: "Publisher PDF",
      },
    ],
    body: "## Notes\n\nAttention is not effort but a patient availability to truth.\n\n![[annotations/ann_attention]]\n",
    recordRevision: recordRevision("preview-revision-1"),
    frontmatter: {},
  },
  {
    collectionId: collection,
    id: sourceId("src_tufte"),
    path: "sources/visual-display.md",
    title: "The Visual Display of Quantitative Information",
    creators: ["Edward Tufte"],
    tags: ["design", "visualisation"],
    readingStatus: "queued",
    documents: [
      {
        fileId: fileId("file_tufte_epub"),
        file: "[[files/visual-display.epub]]",
        revision: fileRevision("sha256:ca102f"),
        mediaType: "application/epub+zip",
        role: "primary",
      },
    ],
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
    document: {
      fileId: fileId("file_weil_pdf"),
      file: "[[files/gravity-and-grace.pdf]]",
      revision: fileRevision("sha256:19e81c"),
    },
    annotationType: "highlight",
    locator: { label: "Page 42" },
    target: {
      quote: {
        exact:
          "Attention consists of suspending our thought, leaving it detached, empty and ready to be penetrated by the object.",
      },
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
    locator: { label: "Page 44" },
    tags: [],
    body: "Compare this with the note on contradiction in the introduction.",
    createdAt: dateTime("2026-08-08T11:03:00+10:00"),
  },
];

class PreviewGateway implements ReaderWorkspaceGateway {
  #sources = [...sources];

  library(): Promise<ReaderLibrarySnapshot> {
    return Promise.resolve({
      collectionName: "Reading",
      sources: this.#sources,
      connectionState: "connected",
    });
  }
  source(id: SourceId): Promise<Source | null> {
    return Promise.resolve(this.#sources.find((source) => source.id === id) ?? null);
  }
  annotations(id: SourceId): Promise<readonly Annotation[]> {
    return Promise.resolve(annotations.filter(({ sourceId: source }) => source === id));
  }
  saveSourceBody(source: Source, body: string): Promise<Source> {
    this.#sources = this.#sources.map((item) => (item.id === source.id ? { ...item, body } : item));
    return Promise.resolve(this.#sources.find((item) => item.id === source.id) ?? source);
  }
}

function PreviewDocument(): JSX.Element {
  return (
    <div className="preview-document" aria-label="Interface preview document">
      <article className="preview-page">
        <div className="preview-running-head">
          <span>GRAVITY AND GRACE</span>
          <span>42</span>
        </div>
        <h1>Attention and Will</h1>
        <p>
          We do not have to acquire humility. There is humility in us—only we humiliate ourselves
          before false gods.
        </p>
        <p className="preview-highlight">
          Attention consists of suspending our thought, leaving it detached, empty and ready to be
          penetrated by the object.
        </p>
        <p>
          Thought must be empty, waiting, not seeking anything, but ready to receive in its naked
          truth the object that is to penetrate it.
        </p>
        <p>
          All wrong translations, all absurdities in geometry problems, all clumsiness of style and
          all faulty connection of ideas in compositions and essays, all such things are due to the
          fact that thought has seized upon some idea too hastily.
        </p>
      </article>
      <div className="preview-notice">
        <span>Interface preview</span> No collection records or files are created.
      </div>
    </div>
  );
}

export function PreviewReader(): JSX.Element {
  const gateway = useMemo(() => new PreviewGateway(), []);
  return <ReaderApp gateway={gateway} renderDocument={() => <PreviewDocument />} />;
}
