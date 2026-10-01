import type { CitationPreview } from "./capture-citation.js";
import type { CaptureIntent } from "./messages.js";
import type { ProjectionReport, QuoteOutcome } from "./page-annotations.js";
import type { PageCapture } from "./page-capture.js";
import type { CaptureDraft } from "./save-capture.js";
import type { ProblemKind } from "./use-action-lock.js";
import type { SourceNoteController } from "./use-source-note.js";
import type { ReaderConnectSnapshot, ReaderDirectAccessController } from "@mdbase-reader/connect";
import type {
  Annotation,
  AnnotationDeletionPlan,
  AnnotationId,
  SourceImportProgress,
  SourceSummary,
} from "@mdbase-reader/core";
import type { Dispatch, SetStateAction } from "react";

export type CaptureStatus = "opening" | "ready" | "saving" | "saved" | "existing";
/** How the saved highlights last drew on the live page. */
export interface PageHighlights {
  readonly report: ProjectionReport;
  readonly outcomes: ReadonlyMap<AnnotationId, QuoteOutcome>;
}
export interface ExtensionCaptureController {
  readonly snapshot: ReaderConnectSnapshot;
  readonly capture: PageCapture | null;
  readonly draft: CaptureDraft;
  readonly setDraft: Dispatch<SetStateAction<CaptureDraft>>;
  readonly draftRestored: boolean;
  readonly status: CaptureStatus;
  readonly problem: string | null;
  readonly problemKind: ProblemKind | null;
  readonly notice: string | null;
  readonly source: SourceSummary | null;
  readonly annotations: readonly Annotation[];
  readonly citation: CitationPreview | null;
  readonly citationPending: boolean;
  readonly deviceCode: string | null;
  readonly directAccess: ReaderDirectAccessController | null;
  readonly projection: PageHighlights | null;
  readonly progress: SourceImportProgress | null;
  readonly busy: boolean;
  readonly refreshing: boolean;
  readonly refreshHighlights: () => Promise<void>;
  readonly saveAttempted: boolean;
  readonly navigated: boolean;
  /** The tab navigated and the panel is reading the new page by itself. */
  readonly following: boolean;
  /** False when the reader has limited Reader's site access in Chrome; null until known. */
  readonly siteAccess: boolean | null;
  /** Asks Chrome for access to every HTTPS site again; call straight from a click. */
  readonly allowAllSites: () => Promise<void>;
  readonly invocation: { readonly intent: CaptureIntent; readonly at: number } | null;
  readonly connect: (choose?: boolean) => Promise<void>;
  readonly retry: () => Promise<void>;
  readonly applySetup: () => Promise<void>;
  readonly select: (id: string) => void;
  /** Saves the draft; `changes` (such as a clicked colour) apply to it first. */
  readonly save: (changes?: Partial<CaptureDraft>) => Promise<void>;
  readonly clearSelection: () => void;
  /** Scrolls the page to a saved highlight and marks it briefly. */
  readonly revealHighlight: (id: AnnotationId) => Promise<void>;
  /** These throw on failure, for the highlight list to report beside the highlight. */
  readonly updateHighlightComment: (annotation: Annotation, comment: string) => Promise<void>;
  readonly planHighlightDeletion: (annotation: Annotation) => Promise<AnnotationDeletionPlan>;
  readonly deleteHighlight: (annotation: Annotation, plan: AnnotationDeletionPlan) => Promise<void>;
  /** A highlight was just saved and can still be taken back. */
  readonly undoable: boolean;
  /** Deletes the highlight just saved; the page stays saved. */
  readonly undoHighlight: () => Promise<void>;
  /** Known tags to suggest; loaded on first use by `loadTags`. */
  readonly knownTags: readonly string[];
  readonly loadTags: () => void;
  /** The saved source's title, tags and literature note, once there is a saved source. */
  readonly note: SourceNoteController;
}
