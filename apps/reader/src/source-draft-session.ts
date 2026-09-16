import { readerErrorMessage } from "./errors.js";
import { clearSourceDraft, readSourceDraft, writeSourceDraft } from "./source-draft-storage.js";
import { trackUnstoredSourceChanges } from "./unsaved-source-drafts.js";

import type { DraftStorage } from "./source-draft-storage.js";
import type { Source } from "@mdbase-reader/core";

export interface SourceDraftSnapshot {
  readonly body: string;
  readonly status: "saved" | "unsaved" | "saving" | "error";
  readonly error: string | null;
  readonly localProblem: string | null;
  readonly locallySaved: boolean;
  readonly recovered: boolean;
  readonly conflict: Source | null;
  readonly savedSource?: Source;
}

/** One writer per source per gateway, shared by inspector and workbench editors. */
export class SourceDraftSession {
  private snapshot: SourceDraftSnapshot;
  private readonly listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private saving = false;
  private inFlight: Promise<void> | null = null;
  private seen = new Set<Source["recordRevision"]>();
  private generation = 0;

  constructor(
    private base: Source,
    private readonly storage: DraftStorage,
    private readonly persist: (source: Source, body: string) => Promise<Source>,
    private readonly refresh: () => Promise<Source | null>,
    private readonly publish: (source: Source) => void,
  ) {
    this.seen.add(base.recordRevision);
    this.snapshot = {
      body: base.body,
      status: "saved",
      error: null,
      localProblem: null,
      locallySaved: false,
      recovered: false,
      conflict: null,
    };
    try {
      const draft = readSourceDraft(storage, base);
      if (draft && draft.body !== base.body) {
        this.snapshot = {
          ...this.snapshot,
          body: draft.body,
          status: "unsaved",
          locallySaved: true,
          recovered: true,
          conflict: draft.baseBody !== base.body ? base : null,
        };
        // The first mounted subscriber resumes safe recovery; conflicts still require a decision.
      } else if (draft) {
        clearSourceDraft(storage, base, base.body);
      }
    } catch {
      this.snapshot = {
        ...this.snapshot,
        localProblem:
          "Local draft storage is unavailable or unreadable. Keep this tab open until the note is saved to the collection.",
      };
    }
  }

  getSnapshot = (): SourceDraftSnapshot => this.snapshot;
  getText = (): string => this.snapshot.body;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    if (this.snapshot.recovered && !this.snapshot.conflict && !this.timer) {
      this.schedule();
    }
    return () => {
      this.listeners.delete(listener);
    };
  };

  edit = (body: string): void => {
    this.generation += 1;
    this.update({
      body,
      status: this.saving ? "saving" : "unsaved",
      error: null,
      recovered: false,
    });
    this.store();
    this.schedule();
  };

  /** External metadata-only changes can advance the revision without disturbing a draft. */
  receive(source: Source): void {
    if (this.seen.has(source.recordRevision)) {
      return;
    }
    this.seen.add(source.recordRevision);
    if (
      this.snapshot.body !== this.base.body &&
      source.body !== this.base.body &&
      source.body !== this.snapshot.body
    ) {
      clearTimeout(this.timer);
      this.update({ conflict: source });
      return;
    }
    const clean = this.snapshot.body === this.base.body;
    this.base = source;
    if (clean) {
      this.update({ body: source.body, status: "saved" });
    }
  }

  save = (): Promise<void> => {
    clearTimeout(this.timer);
    if (this.inFlight) {
      return this.inFlight;
    }
    if (this.snapshot.conflict || this.snapshot.status === "saved") {
      return Promise.resolve();
    }
    this.inFlight = this.write().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  };

  async flush(): Promise<Source> {
    do {
      await this.save();
    } while (this.snapshot.status === "unsaved" && !this.snapshot.conflict);
    if (this.snapshot.status !== "saved" || this.snapshot.conflict) {
      throw new Error(this.snapshot.error ?? "Resolve the source note conflict before continuing.");
    }
    return this.base;
  }

  private async write(): Promise<void> {
    const body = this.snapshot.body;
    const generation = this.generation;
    this.saving = true;
    this.update({ status: "saving", error: null, recovered: false });
    try {
      // Refresh before writing: no silent overwrite of edits made in another application.
      const current = await this.refresh();
      if (!current) {
        throw new Error("This source no longer exists. Your local draft has been retained.");
      }
      this.seen.add(current.recordRevision);
      if (current.body !== this.base.body && current.body !== body) {
        this.update({ conflict: current, status: "unsaved" });
        return;
      }
      const saved = current.body === body ? current : await this.persist(current, body);
      this.base = saved;
      this.seen.add(saved.recordRevision);
      this.publish(saved);
      this.update({ savedSource: saved });
      try {
        clearSourceDraft(this.storage, saved, body);
      } catch {
        // A stale recovery copy is safer than discarding unsaved work.
      }
      if (generation === this.generation) {
        this.update({ status: "saved", locallySaved: false, conflict: null });
      } else {
        this.update({ status: "unsaved" });
        this.store();
        this.schedule();
      }
    } catch (reason) {
      this.update({
        status: "error",
        error: readerErrorMessage(
          reason,
          "Reader could not save this note. Your draft is retained.",
        ),
      });
      try {
        const current = await this.refresh();
        if (current && current.body !== this.base.body && current.body !== this.snapshot.body) {
          this.update({ conflict: current });
        }
      } catch {
        // Disconnection: retain the draft and offer explicit retry.
      }
    } finally {
      this.saving = false;
    }
  }

  resolve = (choice: "local" | "remote"): void => {
    const remote = this.snapshot.conflict;
    if (!remote || this.saving) {
      return;
    }
    this.base = remote;
    this.update({ conflict: null, error: null, recovered: false });
    if (choice === "remote") {
      try {
        clearSourceDraft(this.storage, remote, this.snapshot.body);
      } catch {
        /* Retain on failure. */
      }
      this.update({ body: remote.body, status: "saved", locallySaved: false, savedSource: remote });
      this.publish(remote);
    } else {
      this.store();
      void this.save();
    }
  };

  private schedule(): void {
    clearTimeout(this.timer);
    if (!this.snapshot.conflict) {
      this.timer = setTimeout(() => void this.save(), 1000);
    }
  }

  private store(): void {
    try {
      writeSourceDraft(this.storage, this.base, this.snapshot.body);
      this.update({ locallySaved: true, localProblem: null });
    } catch {
      this.update({
        locallySaved: false,
        localProblem:
          "This draft could not be saved locally. Keep this tab open and retry saving to the collection.",
      });
    }
  }

  private update(patch: Partial<SourceDraftSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    trackUnstoredSourceChanges(
      this,
      this.snapshot.status !== "saved" && !this.snapshot.locallySaved,
    );
    this.listeners.forEach((listener) => listener());
  }
}
