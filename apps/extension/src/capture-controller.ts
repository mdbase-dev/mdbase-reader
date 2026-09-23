import type { ProjectionReport } from "./page-annotations.js";
import type { SelectedWebCapture } from "./page-capture.js";
import type { CaptureDraft } from "./save-capture.js";
import type { ReaderConnectSnapshot } from "@mdbase-reader/connect";
import type { Annotation, SourceImportProgress, SourceSummary } from "@mdbase-reader/core";
import type { Dispatch, SetStateAction } from "react";

export type CaptureStatus = "opening" | "ready" | "saving" | "saved" | "existing";
export interface ExtensionCaptureController {
  readonly snapshot: ReaderConnectSnapshot;
  readonly capture: SelectedWebCapture | null;
  readonly draft: CaptureDraft;
  readonly setDraft: Dispatch<SetStateAction<CaptureDraft>>;
  readonly status: CaptureStatus;
  readonly problem: string | null;
  readonly notice: string | null;
  readonly source: SourceSummary | null;
  readonly annotations: readonly Annotation[];
  readonly deviceCode: string | null;
  readonly projection: ProjectionReport | null;
  readonly progress: SourceImportProgress | null;
  readonly busy: boolean;
  readonly saveAttempted: boolean;
  readonly connect: (choose?: boolean) => Promise<void>;
  readonly retry: () => Promise<void>;
  readonly applySetup: () => Promise<void>;
  readonly select: (id: string) => void;
  readonly save: () => Promise<void>;
  readonly showAnnotations: () => Promise<void>;
  readonly readSelection: () => Promise<void>;
}
