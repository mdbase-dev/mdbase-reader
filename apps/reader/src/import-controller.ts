import {
  planZotero,
  previewMigration,
  readZoteroBundle,
  ReadwiseClient,
  runMigration,
  scanReadwise,
  type MigrationPlan,
  type MigrationProgress,
  type MigrationResult,
} from "@mdbase-reader/migration";

import { markFraction, withMarkProgress } from "./mark-activity.js";

import type { ReaderApplicationSession } from "@mdbase-reader/connect";
export interface ImportState {
  plan: MigrationPlan | null;
  message: string;
  error: string;
  busy: boolean;
  preview: { collectionId: string; newRecords: number; existingRecords: number } | null;
  progress: MigrationProgress | null;
  result: MigrationResult | null;
  boundTarget: string | null;
}
export class ImportController {
  private state: ImportState = {
    plan: null,
    message: "Choose a service to bring your library into mdbase Reader.",
    error: "",
    busy: false,
    preview: null,
    progress: null,
    result: null,
    boundTarget: null,
  };
  private listeners = new Set<() => void>();
  private active: AbortController | null = null;
  private client: ReadwiseClient | null = null;
  constructor(private session: ReaderApplicationSession) {}
  getSnapshot = (): ImportState => this.state;
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  update(patch: Partial<ImportState>): void {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) {
      fn();
    }
  }
  stop = (): void => {
    this.active?.abort();
  };
  dispose(): void {
    this.stop();
    this.client?.forget();
  }
  private async task(work: (signal: AbortSignal) => Promise<void>): Promise<void> {
    if (this.active) {
      return;
    }
    const control = new AbortController();
    this.active = control;
    this.update({ busy: true, error: "" });
    try {
      await work(control.signal);
    } catch (reason) {
      const cancelled = control.signal.aborted;
      this.update({
        error: cancelled
          ? "Stopped. Already committed data is kept. Resume with the same input and destination; existing records will not be overwritten."
          : reason instanceof Error
            ? reason.message
            : "Import operation failed.",
        message: cancelled ? "Stopped" : "Not complete — review the error before resuming",
      });
    } finally {
      this.active = null;
      this.update({ busy: false });
    }
  }
  selectBundle(files: FileList | null): void {
    if (!files?.length || this.state.boundTarget) {
      return;
    }
    void this.task(async (signal) => {
      this.update({ plan: null, preview: null, result: null });
      const input = new Map<string, Blob>();
      for (const file of files) {
        const relative = file.webkitRelativePath.split("/").slice(1).join("/");
        if (!relative || input.has(relative)) {
          throw new Error("Select one complete bundle folder with unique file paths.");
        }
        input.set(relative, file);
      }
      const bundle = await readZoteroBundle(input, signal, (message) => this.update({ message }));
      const plan = await planZotero(bundle);
      signal.throwIfAborted();
      this.update({
        plan,
        message: "Bundle verified. Review the contents and choose a destination.",
      });
    });
  }
  scan(token: string, includeFeed: boolean): void {
    if (this.state.boundTarget) {
      return;
    }
    void this.task(async (signal) => {
      this.client?.forget();
      this.client = new ReadwiseClient(token.trim());
      this.update({ plan: null, preview: null, result: null });
      const plan = await scanReadwise(this.client, includeFeed, signal, (message) =>
        this.update({ message }),
      );
      this.update({
        plan,
        message: "Library scanned. Review the contents and choose a destination.",
      });
    });
  }
  inspect = (): void => {
    const { plan } = this.state;
    const opened = this.session.connectedCollection();
    if (!plan || !opened) {
      return;
    }
    const target = opened.migration;
    void this.task(async (signal) => {
      this.update({ message: "Checking existing import identities…" });
      const next = await previewMigration(plan, target, signal);
      this.update({
        preview: { ...next, collectionId: target.collectionId },
        message: "Destination checked. Confirm below to begin writing.",
      });
    });
  };
  start = (): void => {
    const { plan, preview, boundTarget } = this.state;
    const opened = this.session.connectedCollection();
    if (
      !plan ||
      !opened ||
      preview?.collectionId !== opened.collectionId ||
      (boundTarget && boundTarget !== opened.collectionId)
    ) {
      return;
    }
    const target = opened.migration;
    const name = opened.collectionName;
    this.update({ boundTarget: target.collectionId });
    void this.task(async (signal) => {
      this.update({ result: null });
      // The mark fills with the import and plays saved or error when it ends; a stop is quiet.
      const result = await withMarkProgress(
        (mark) =>
          runMigration(plan, target, signal, (progress) => {
            mark(markFraction(progress.completed, progress.total));
            this.update({ progress, message: `${progress.phase} — ${name}` });
            saveProgress(plan.service, progress);
          }),
        undefined,
        signal,
      );
      this.client?.forget();
      this.update({
        result,
        message: `Import complete into ${name}. ${result.verified.toLocaleString()} records verified.`,
      });
    });
  };
}
function saveProgress(service: string, progress: MigrationProgress): void {
  try {
    localStorage.setItem(
      "reader:last-migration",
      JSON.stringify({ service, ...progress, updatedAt: new Date().toISOString() }),
    );
  } catch {
    /* Remote identities remain the resume authority. */
  }
}
