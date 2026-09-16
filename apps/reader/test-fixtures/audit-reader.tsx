// Dev-only entry point. All API traffic is intercepted by scripts/audit-reader.mjs.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@mdbase-reader/ui/styles.css";
import "../src/reader.css";
import "../src/reader-improvements.css";
import "../src/annotation-polish.css";

import { ConnectedDocument } from "../src/ConnectedDocument.js";
import {
  applyLibraryViewConfiguration,
  defaultLibraryView,
  type MdbaseLibraryView,
} from "../src/mdbase-library-views.js";
import { PreviewGateway } from "../src/preview.js";
import { ReaderApp } from "../src/ReaderApp.js";

import type { ReaderLibrarySnapshot } from "../src/workspace-model.js";
import type {
  Annotation,
  AnnotationCreationRequest,
  AnnotationDeletionPlan,
  DocumentRepository,
  FileId,
  ReadingPosition,
  Source,
  SourceId,
  SourceTextSearchMatch,
} from "@mdbase-reader/core";

async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(
    `/__reader-audit/${path}`,
    body === undefined
      ? {}
      : {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  if (!response.ok) {
    throw new Error("[test] Collection is offline");
  }
  return (await response.json()) as T;
}
class AuditGateway extends PreviewGateway {
  private sources: readonly Source[] = [];
  override async library(): Promise<ReaderLibrarySnapshot> {
    this.sources = await api<readonly Source[]>("library");
    return {
      collectionName: "[test] Reader audit",
      connectionState: "connected",
      sources: this.sources,
    };
  }
  override listLibraryViews(): Promise<readonly MdbaseLibraryView[]> {
    return Promise.resolve([defaultLibraryView]);
  }
  override executeLibraryView(
    view: MdbaseLibraryView,
  ): Promise<ReturnType<typeof this.viewResult>> {
    return Promise.resolve(this.viewResult(view));
  }
  private viewResult(view: MdbaseLibraryView): {
    sources: readonly Source[];
    valuesByPath: Map<string, Readonly<Record<string, unknown>>>;
    totalCount: number;
  } {
    return {
      sources: applyLibraryViewConfiguration(this.sources, view.configuration) as readonly Source[],
      valuesByPath: new Map(),
      totalCount: this.sources.length,
    };
  }
  override async source(id: SourceId): Promise<Source | null> {
    return api(`source/${id}`);
  }
  override async saveSourceBody(source: Source, body: string): Promise<Source> {
    return api(`source/${source.id}`, { body, revision: source.recordRevision });
  }
  override async saveReadingPosition(
    source: Source,
    fileId: FileId,
    position: ReadingPosition,
  ): Promise<Source> {
    return api(`source/${source.id}`, {
      reading: {
        status: "reading",
        documentFileId: fileId,
        position,
        lastOpenedAt: new Date().toISOString(),
      },
    });
  }
  override annotations(id: SourceId): Promise<readonly Annotation[]> {
    return api(`annotations/${id}`);
  }
  override createAnnotation(request: AnnotationCreationRequest): Promise<Annotation> {
    return api(`annotations/${request.sourceId}`, { op: "create", request });
  }
  async refreshAnnotation(annotation: Annotation): Promise<Annotation | null> {
    const records = await api<Annotation[]>(`annotations/${annotation.sourceId}`);
    return records.find(({ id }) => id === annotation.id) ?? null;
  }
  override updateAnnotation(annotation: Annotation, body: string): Promise<Annotation> {
    return api(`annotations/${annotation.sourceId}`, { op: "update", annotation, body });
  }
  override planAnnotationDeletion(annotation: Annotation): Promise<AnnotationDeletionPlan> {
    return api(`annotations/${annotation.sourceId}`, { op: "plan-delete", annotation });
  }
  override deleteAnnotation(annotation: Annotation): Promise<void> {
    return api(`annotations/${annotation.sourceId}`, { op: "delete", annotation });
  }
  override transcludeAnnotation(source: Source, annotation: Annotation): Promise<Source> {
    return this.saveSourceBody(
      source,
      `${source.body}\n\n![[${annotation.path?.replace(/\.md$/u, "") ?? `annotations/${annotation.id}`}]]\n`,
    );
  }
  override searchText(): Promise<readonly []> {
    return Promise.resolve([]);
  }
}
// Keep the fixture's content-search contract separate from PreviewGateway's deliberately empty result.
const base = new AuditGateway();
const gateway = Object.assign(base, {
  searchText: async (query: string): Promise<readonly SourceTextSearchMatch[]> =>
    api(`search?q=${encodeURIComponent(query)}`),
});
const repository: DocumentRepository = {
  async open(_collection, target, options) {
    const response = await fetch(`/__reader-audit/document/${target.fileId}`, {
      signal: options?.signal ?? null,
    });
    if (!response.ok) {
      throw new Error("[test] Document unavailable");
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    return {
      fileId: target.fileId,
      revision: target.revision,
      url,
      mediaType: blob.type,
      close: () => {
        URL.revokeObjectURL(url);
        return Promise.resolve();
      },
    };
  },
};
const root = document.querySelector("#root");
if (!root) {
  throw new Error("Test root missing");
}
createRoot(root).render(
  <StrictMode>
    <ReaderApp
      gateway={gateway}
      renderDocument={(source, onSurfaceChange) => (
        <ConnectedDocument
          repository={repository}
          source={source}
          onSurfaceChange={onSurfaceChange}
        />
      )}
      saveFile={() => Promise.resolve()}
    />
  </StrictMode>,
);
