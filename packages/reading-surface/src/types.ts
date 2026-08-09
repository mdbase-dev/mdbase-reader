import type { EventSource } from "./events.js";
import type { Annotation, AnnotationTarget, DocumentTarget } from "@mdbase-reader/core";

export type SurfaceKind = "pdf" | "epub" | "html";

export type ReaderLocator =
  | {
      readonly kind: "pdf";
      readonly pageIndex: number;
      readonly x?: number;
      readonly y?: number;
    }
  | {
      readonly kind: "epub";
      readonly locator: Readonly<Record<string, unknown>>;
    }
  | {
      readonly kind: "html";
      readonly href: string;
      readonly progression?: number;
    };

export interface SurfaceDocument {
  readonly document: DocumentTarget;
  readonly mediaType: string;
  readonly url: string;
}

export interface TextSelectionDraft {
  readonly target: AnnotationTarget & { readonly quote: NonNullable<AnnotationTarget["quote"]> };
  readonly locator: ReaderLocator;
}

export interface AreaSelectionDraft {
  readonly pageIndex: number;
  readonly rect: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly coordinateProfile: string;
  readonly image: Blob;
  readonly imageType: string;
  readonly scale: number;
  readonly withAnnotations: boolean;
}

export interface TextSelectionCapability {
  readonly selections: EventSource<TextSelectionDraft>;
  clearSelection(): void;
}

export interface AreaSelectionCapability {
  readonly selections: EventSource<AreaSelectionDraft>;
  beginAreaSelection(): void;
  cancelAreaSelection(): void;
}

export interface DecorationCapability {
  setAnnotations(annotations: readonly Annotation[]): Promise<void>;
}

export interface AnnotationNavigationCapability {
  goToAnnotation(annotation: Annotation): Promise<boolean>;
}

export interface ReadingSurfaceCapabilities {
  readonly textSelection?: TextSelectionCapability;
  readonly areaSelection?: AreaSelectionCapability;
  readonly decorations?: DecorationCapability;
  readonly annotationNavigation?: AnnotationNavigationCapability;
}

export interface ReadingSurface {
  readonly kind: SurfaceKind;
  readonly document: SurfaceDocument;
  readonly capabilities: ReadingSurfaceCapabilities;
  readonly locations: EventSource<ReaderLocator>;
  currentLocation(): ReaderLocator | null;
  goTo(locator: ReaderLocator): Promise<boolean>;
  destroy(): Promise<void>;
}
