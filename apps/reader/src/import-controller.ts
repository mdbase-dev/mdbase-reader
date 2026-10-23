import { plural, t } from "@lingui/core/macro";
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

import type { ReaderCollectionProvider } from "@mdbase-reader/connect";
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
    message: t({ message: "Choose a service to bring your library into mdbase Reader." }),
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
  constructor(private session: ReaderCollectionProvider) {}
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
          ? t({
              message:
                "Stopped. Already committed data is kept. Resume with the same input and destination; existing records will not be overwritten.",
            })
          : reason instanceof Error
            ? reason.message
            : t({ message: "Import operation failed." }),
        message: cancelled
          ? t`Stopped`
          : t({ message: "Not complete — review the error before resuming" }),
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
          throw new Error(
            t({ message: "Select one complete bundle folder with unique file paths." }),
          );
        }
        input.set(relative, file);
      }
      const bundle = await readZoteroBundle(input, signal, (message) => {
        if (!signal.aborted) {
          this.update({ message });
        }
      });
      const plan = await planZotero(bundle);
      signal.throwIfAborted();
      this.update({
        plan,
        message: t({ message: "Bundle verified. Review the contents and choose a destination." }),
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
      const plan = await scanReadwise(this.client, includeFeed, signal, (message) => {
        if (!signal.aborted) {
          this.update({ message });
        }
      });
      signal.throwIfAborted();
      this.update({
        plan,
        message: t({ message: "Library scanned. Review the contents and choose a destination." }),
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
      this.update({ message: t({ message: "Checking existing import identities…" }) });
      const next = await previewMigration(plan, target, signal);
      signal.throwIfAborted();
      this.update({
        preview: { ...next, collectionId: target.collectionId },
        message: t({ message: "Destination checked. Confirm below to begin writing." }),
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
            if (signal.aborted) {
              return;
            }
            mark(markFraction(progress.completed, progress.total));
            this.update({ progress, message: t`${migrationPhaseLabel(progress.phase)} — ${name}` });
            saveProgress(plan.service, progress);
          }),
        undefined,
        signal,
      );
      signal.throwIfAborted();
      this.client?.forget();
      this.update({
        result,
        message: t`Import complete into ${name}. ${plural(result.verified, { one: "# record verified", other: "# records verified" })}.`,
      });
    });
  };
}
/** Migration currently reports source phase tokens; do not store translated phases. */
function migrationPhaseLabel(phase: string): string {
  switch (phase) {
    case "Preparing":
      return t`Preparing`;
    case "Creating sources":
      return t`Creating sources`;
    case "Creating annotations and notes":
      return t`Creating annotations and notes`;
    case "Verifying imported records":
      return t`Verifying imported records`;
    case "Complete":
      return t({ message: "Complete", context: "Import completed" });
    default: {
      const files = /^Files: (\d+) of (\d+)$/u.exec(phase);
      const completed = files?.[1] ?? "";
      const total = files?.[2] ?? "";
      return files ? t`Files: ${completed} of ${total}` : phase;
    }
  }
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
