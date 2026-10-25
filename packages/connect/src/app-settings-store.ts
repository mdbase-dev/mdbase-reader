/**
 * One app's collection-scope settings record (`docs/design/app-settings.md`): read by path,
 * defaults when it is missing, created on the first save, then patched field by field against
 * the revision that was read. Nothing here creates the record on read or rewrites it to repair
 * a field: an unusable field takes its default with a warning until someone saves it.
 */
import {
  appSettingsPatch,
  appSettingsPath,
  conflictingAppSettings,
  defaultAppSettings,
  newAppSettingsFrontmatter,
  resolveAppSettings,
  type AppSettingsChanges,
  type AppSettingsDefinition,
  type ResolvedAppSettings,
} from "@mdbase-reader/core";

import { isPathTaken } from "./validation-issues.js";

import type { ReaderConnectClient } from "./repository-client.js";
import type { ConnectOutcome, ConnectProblem, RecordDocument } from "@mdbase-dev/connect";

export interface AppSettingsSnapshot<Values extends object> {
  /** `loading` until the first read, `failed` when it could not be read: defaults apply. */
  readonly status: "loading" | "ready" | "failed";
  readonly settings: ResolvedAppSettings<Values>;
  /** The record's frontmatter as read; undefined when there is no record (yet). */
  readonly frontmatter?: Readonly<Record<string, unknown>>;
  readonly revision?: string;
  /** Why the read failed, when it did. */
  readonly problem?: string;
}

export type AppSettingsSaveResult<Values extends object> =
  | { readonly ok: true; readonly snapshot: AppSettingsSnapshot<Values> }
  | {
      readonly ok: false;
      /**
       * `conflict`: someone else changed `fields` since the save was prepared; nothing was
       * written. `read_only`: this client may not change these settings. `failed`: anything else.
       */
      readonly reason: "conflict" | "read_only" | "failed";
      readonly message: string;
      readonly fields?: readonly string[];
      readonly snapshot: AppSettingsSnapshot<Values>;
    };

export interface AppSettingsStoreOptions<Values extends object> {
  /**
   * Checks a store cannot make synchronously, such as parsing a template. Returns the settings
   * with any unusable value back at its default and a warning added.
   */
  readonly refine?: (settings: ResolvedAppSettings<Values>) => Promise<ResolvedAppSettings<Values>>;
  /**
   * Calls `onChange` when the record may have changed outside this store: another tab, app or
   * device, or a change feed reset. Absent where there is no change feed.
   */
  readonly watch?: (path: string, onChange: () => void) => () => void;
}

export class AppSettingsStore<Values extends object> {
  readonly path: string;
  readonly #client: ReaderConnectClient;
  readonly #definition: AppSettingsDefinition<Values>;
  readonly #options: AppSettingsStoreOptions<Values>;
  readonly #listeners = new Set<() => void>();
  #snapshot: AppSettingsSnapshot<Values>;
  #loading: Promise<AppSettingsSnapshot<Values>> | undefined;
  #stopWatching: (() => void) | undefined;
  /** Bumped by every read and write, so a slow read never replaces a newer result. */
  #generation = 0;
  /** Set when a write was refused for lack of access; it holds until the next session. */
  #refused: string | undefined;

  public constructor(
    client: ReaderConnectClient,
    definition: AppSettingsDefinition<Values>,
    options: AppSettingsStoreOptions<Values> = {},
  ) {
    this.#client = client;
    this.#definition = definition;
    this.#options = options;
    this.path = appSettingsPath(definition.app);
    this.#snapshot = { status: "loading", settings: defaultAppSettings(definition) };
  }

  public getSnapshot = (): AppSettingsSnapshot<Values> => this.#snapshot;

  /** Follow the record. The first listener starts the read and the change feed. */
  public subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    if (this.#listeners.size === 1) {
      this.#stopWatching = this.#options.watch?.(this.path, () => {
        void this.reload();
      });
    }
    void this.current();
    return () => {
      this.#listeners.delete(listener);
      if (this.#listeners.size === 0) {
        this.#stopWatching?.();
        this.#stopWatching = undefined;
      }
    };
  };

  /** The settings as last read, reading them first if they have not been read yet. */
  public async current(): Promise<AppSettingsSnapshot<Values>> {
    if (this.#snapshot.status === "ready") {
      return this.#snapshot;
    }
    this.#loading ??= this.reload().finally(() => {
      this.#loading = undefined;
    });
    return this.#loading;
  }

  /** Read the record again. */
  public async reload(): Promise<AppSettingsSnapshot<Values>> {
    const generation = ++this.#generation;
    const read = await this.#read();
    if (generation === this.#generation) {
      this.#publish(read);
    }
    return this.#snapshot;
  }

  /**
   * Save `changes`: a value per changed setting, or null to go back to its default. `base` is
   * the snapshot the changes were made against (default: the settings as now read); a setting
   * someone else changed since then is a conflict, and nothing is written.
   */
  public async save(
    changes: AppSettingsChanges<Values>,
    prepared?: AppSettingsSnapshot<Values>,
  ): Promise<AppSettingsSaveResult<Values>> {
    let latest = await this.current();
    const base = (prepared ?? latest).frontmatter;
    for (let attempt = 0; ; attempt += 1) {
      const refused = this.#refuseBefore(latest, base, changes);
      if (refused) {
        return refused;
      }
      const written = await this.#write(latest, changes);
      if (!("raced" in written)) {
        return written;
      }
      if (attempt > 0) {
        return this.#refusal("failed", written.raced);
      }
      // Someone else created or changed the record first: read it and go again once.
      latest = await this.reload();
    }
  }

  #refuseBefore(
    latest: AppSettingsSnapshot<Values>,
    base: Readonly<Record<string, unknown>> | undefined,
    changes: AppSettingsChanges<Values>,
  ): AppSettingsSaveResult<Values> | undefined {
    if (latest.status === "failed") {
      return this.#refusal("failed", latest.problem ?? "The settings could not be read.");
    }
    if (latest.settings.readOnly) {
      return this.#refusal("read_only", latest.settings.readOnly);
    }
    const conflicts = conflictingAppSettings(
      this.#definition,
      base,
      latest.frontmatter ?? {},
      changes,
    );
    return conflicts.length > 0
      ? this.#refusal(
          "conflict",
          "These settings were changed somewhere else. Review them and save again.",
          conflicts,
        )
      : undefined;
  }

  /** One write: the result, or why it raced someone else's. */
  async #write(
    latest: AppSettingsSnapshot<Values>,
    changes: AppSettingsChanges<Values>,
  ): Promise<AppSettingsSaveResult<Values> | { readonly raced: string }> {
    const generation = ++this.#generation;
    const outcome = latest.frontmatter
      ? await this.#patch(latest.frontmatter, latest.revision, changes)
      : await this.#create(changes);
    if (outcome === "unchanged") {
      return { ok: true, snapshot: latest };
    }
    if (outcome.ok) {
      if (generation === this.#generation) {
        this.#publish(await this.#resolve(outcome.value));
      }
      return { ok: true, snapshot: this.#snapshot };
    }
    const { problem } = outcome;
    if (problem.code === "not_authorized" || problem.code === "access_denied") {
      this.#refused = "This connection cannot change the collection's settings.";
      this.#publish({ ...this.#snapshot });
      return this.#refusal("read_only", this.#refused);
    }
    return problem.code === "concurrent_modification" || isPathTaken(problem)
      ? { raced: problemMessage(problem) }
      : this.#refusal("failed", problemMessage(problem));
  }

  async #read(): Promise<AppSettingsSnapshot<Values>> {
    let outcome: ConnectOutcome<RecordDocument>;
    try {
      outcome = await this.#client.read({ path: this.path });
    } catch (error) {
      return this.#failed(
        error instanceof Error ? error.message : "The settings could not be read.",
      );
    }
    if (outcome.ok) {
      return this.#resolve(outcome.value);
    }
    if (outcome.problem.code === "file_not_found") {
      // No record: the defaults. It is created by the first save, never by a read.
      return this.#withRefusal({
        status: "ready",
        settings: await this.#refine(defaultAppSettings(this.#definition)),
      });
    }
    return this.#failed(problemMessage(outcome.problem));
  }

  async #resolve(document: RecordDocument): Promise<AppSettingsSnapshot<Values>> {
    const frontmatter = document.frontmatter;
    return this.#withRefusal({
      status: "ready",
      settings: await this.#refine(resolveAppSettings(this.#definition, frontmatter)),
      frontmatter,
      revision: document.revision,
    });
  }

  async #refine(settings: ResolvedAppSettings<Values>): Promise<ResolvedAppSettings<Values>> {
    return this.#options.refine ? this.#options.refine(settings) : settings;
  }

  #failed(problem: string): AppSettingsSnapshot<Values> {
    return {
      status: "failed",
      settings: { ...defaultAppSettings(this.#definition), readOnly: problem },
      problem,
    };
  }

  #withRefusal(snapshot: AppSettingsSnapshot<Values>): AppSettingsSnapshot<Values> {
    return this.#refused && !snapshot.settings.readOnly
      ? { ...snapshot, settings: { ...snapshot.settings, readOnly: this.#refused } }
      : snapshot;
  }

  async #create(changes: AppSettingsChanges<Values>): Promise<ConnectOutcome<RecordDocument>> {
    return this.#client.create({
      path: this.path,
      type: this.#definition.type,
      frontmatter: newAppSettingsFrontmatter(this.#definition, changes),
    });
  }

  async #patch(
    frontmatter: Readonly<Record<string, unknown>>,
    revision: string | undefined,
    changes: AppSettingsChanges<Values>,
  ): Promise<ConnectOutcome<RecordDocument> | "unchanged"> {
    const patch = appSettingsPatch(this.#definition, frontmatter, changes);
    if (Object.keys(patch).length === 0) {
      return "unchanged";
    }
    return this.#client.update({
      path: this.path,
      ...(revision ? { ifRevision: revision } : {}),
      patch: patch,
    });
  }

  #refusal(
    reason: "conflict" | "read_only" | "failed",
    message: string,
    fields?: readonly string[],
  ): AppSettingsSaveResult<Values> {
    return {
      ok: false,
      reason,
      message,
      ...(fields ? { fields } : {}),
      snapshot: this.#snapshot,
    };
  }

  #publish(snapshot: AppSettingsSnapshot<Values>): void {
    this.#snapshot = this.#withRefusal(snapshot);
    for (const listener of [...this.#listeners]) {
      listener();
    }
  }
}

function problemMessage(problem: ConnectProblem): string {
  return problem.message || "The settings could not be saved.";
}
