import type { EventSource } from "./events.js";
import type {
  Annotation,
  AnnotationId,
  AnnotationTarget,
  DocumentTarget,
} from "@mdbase-reader/core";

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

/** A rectangle in the top-level window's viewport, in CSS pixels. */
export interface ViewportRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface TextSelectionDraft {
  readonly target: AnnotationTarget & { readonly quote: NonNullable<AnnotationTarget["quote"]> };
  readonly locator: ReaderLocator;
  /** Where the selection appeared on screen when it was made, for placing selection UI. */
  readonly anchor?: ViewportRect;
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
  setActiveAnnotation(annotation: Annotation | null): Promise<void>;
}

export interface AnnotationNavigationCapability {
  goToAnnotation(annotation: Annotation): Promise<boolean>;
}

export interface AnnotationActivationCapability {
  readonly activations: EventSource<AnnotationId>;
}

export interface ContentsEntry {
  readonly id: string;
  readonly title: string;
  /** Nesting depth, starting at 0. */
  readonly level: number;
}

/** A document's own table of contents, for moving between its sections. */
export interface ContentsCapability {
  entries(): readonly ContentsEntry[];
  goTo(id: string): Promise<boolean>;
}

/** Reader-chosen presentation for reflowable text. Fixed-layout documents such as PDF ignore it. */
export interface ReadingTypography {
  /** Multiplier of the document's base text size, from 0.8 to 1.6. */
  readonly scale: number;
  readonly measure: "narrow" | "standard" | "wide";
  readonly face: "serif" | "sans";
}

export interface TypographyCapability {
  setTypography(typography: ReadingTypography): Promise<void>;
}

export interface TextExtractionCapability {
  extractText(options?: { readonly signal?: AbortSignal }): Promise<string>;
}

export interface ReadingSurfaceCapabilities {
  readonly textSelection?: TextSelectionCapability;
  readonly areaSelection?: AreaSelectionCapability;
  readonly decorations?: DecorationCapability;
  readonly annotationNavigation?: AnnotationNavigationCapability;
  readonly annotationActivation?: AnnotationActivationCapability;
  readonly textExtraction?: TextExtractionCapability;
  readonly contents?: ContentsCapability;
  readonly typography?: TypographyCapability;
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
