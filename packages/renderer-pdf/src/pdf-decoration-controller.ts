import { annotationToPdfDecoration } from "./pdf-decoration.js";

import type { PdfAnnotationObject } from "@embedpdf/models";
import type { AnnotationPlugin } from "@embedpdf/plugin-annotation";
import type { Annotation } from "@mdbase-reader/core";

type EmbedPdfAnnotationCapability = ReturnType<AnnotationPlugin["provides"]>;

export interface PdfDecorationController {
  setAnnotations(annotations: readonly Annotation[]): void;
  setActiveAnnotation(annotation: Annotation | null): void;
  destroy(): void;
}

const readerDecorationPrefix = "mdbase-reader:";

/**
 * Keeps Reader's durable annotations mirrored into EmbedPDF's transient annotation state.
 * `importAnnotations` is deliberately used instead of `createAnnotation`: EmbedPDF queues imports
 * until its asynchronous native-annotation load has completed, while direct creates can be erased
 * when that load replaces the annotation state.
 */
export function createPdfDecorationController(
  capability: EmbedPdfAnnotationCapability,
): PdfDecorationController {
  let desired = new Map<string, PdfAnnotationObject>();
  const requested = new Map<string, string>();
  let activeDecorationId: string | null = null;

  const requestImport = (decoration: PdfAnnotationObject): void => {
    const fingerprint = decorationFingerprint(decoration);
    if (requested.get(decoration.id) === fingerprint) {
      return;
    }
    capability.importAnnotations([{ annotation: decoration }]);
    requested.set(decoration.id, fingerprint);
  };

  const applyActiveDecoration = (): void => {
    if (activeDecorationId) {
      const tracked = capability.getAnnotationById(activeDecorationId);
      if (tracked) {
        capability.selectAnnotation(tracked.object.pageIndex, activeDecorationId);
        return;
      }
    }
    capability.deselectAnnotation();
  };

  const reconcile = (): void => {
    const current = capability
      .getAnnotations()
      .map(({ object }) => object)
      .filter(isReaderDecoration);

    for (const decoration of current) {
      if (!desired.has(decoration.id)) {
        capability.purgeAnnotation(decoration.pageIndex, decoration.id);
        requested.delete(decoration.id);
      }
    }

    for (const decoration of desired.values()) {
      const existing = capability.getAnnotationById(decoration.id)?.object;
      if (!existing) {
        requestImport(decoration);
        continue;
      }
      const fingerprint = decorationFingerprint(decoration);
      if (existing.pageIndex !== decoration.pageIndex || existing.type !== decoration.type) {
        capability.purgeAnnotation(existing.pageIndex, existing.id);
        requested.delete(decoration.id);
        requestImport(decoration);
      } else if (decorationFingerprint(existing) !== fingerprint) {
        capability.syncAnnotationObject(decoration.id, decoration);
        requested.set(decoration.id, fingerprint);
      } else {
        requested.set(decoration.id, fingerprint);
      }
    }

    applyActiveDecoration();
  };

  const unsubscribeLoaded = capability.onAnnotationEvent((event) => {
    if (event.type === "loaded") {
      // A completed native load is authoritative about what survived. Clear optimistic requests so
      // reconciliation can restore anything absent rather than suppressing the retry forever.
      requested.clear();
      reconcile();
    }
  });

  return {
    setAnnotations(annotations) {
      const next = new Map<string, PdfAnnotationObject>();
      for (const annotation of annotations) {
        const decoration = annotationToPdfDecoration(annotation);
        if (decoration) {
          next.set(decoration.id, decoration);
        }
      }
      desired = next;
      for (const id of requested.keys()) {
        if (!desired.has(id)) {
          requested.delete(id);
        }
      }
      reconcile();
    },
    setActiveAnnotation(annotation) {
      activeDecorationId = annotation ? (annotationToPdfDecoration(annotation)?.id ?? null) : null;
      applyActiveDecoration();
    },
    destroy: unsubscribeLoaded,
  };
}

function isReaderDecoration(annotation: PdfAnnotationObject): boolean {
  const custom: unknown = annotation.custom;
  return (
    annotation.id.startsWith(readerDecorationPrefix) &&
    custom !== null &&
    typeof custom === "object" &&
    Reflect.get(custom, "source") === "mdbase-reader"
  );
}

function decorationFingerprint(annotation: PdfAnnotationObject): string {
  return JSON.stringify(annotation);
}
