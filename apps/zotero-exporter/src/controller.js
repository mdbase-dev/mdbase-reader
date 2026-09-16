// Loaded into the plugin scope; also exercised in Node with injected adapters.
// eslint-disable-next-line no-unused-vars
var ReaderExportController = class {
  constructor({ api, adapter, join, AbortController, now = () => new Date(), suffix }) {
    Object.assign(this, { api, adapter, join, AbortController, now, suffix });
    this.listeners = new Set();
    this.state = { phase: "idle", message: "Choose where to save your migration bundle." };
    this.job = null;
    this.abort = null;
    this.disposed = false;
  }
  get busy() {
    return ["scanning", "exporting", "cancelling"].includes(this.state.phase);
  }
  subscribe(fn) {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }
  update(patch) {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) {
      try {
        fn(this.state);
      } catch {
        /* A closed UI cannot fail a file copy. */
      }
    }
  }
  async prepare(parent) {
    if (this.disposed || this.busy) return;
    this.abort = new this.AbortController();
    const signal = this.abort.signal;
    this.state = {
      phase: "scanning",
      parent,
      message: "Checking metadata, attachments and disk space…",
    };
    this.update({});
    this.job = this.scan(parent, signal);
    await this.job;
  }
  async scan(parent, signal) {
    try {
      const snapshot = await this.adapter.snapshot();
      if (snapshot.syncing)
        throw new Error("Zotero is syncing. Wait for it to finish, then choose the folder again.");
      let bytes = 0,
        available = 0,
        missing = 0,
        linkedURLs = 0;
      for (const a of snapshot.attachments) {
        if (signal.aborted) throw new Error("Cancelled");
        const payload = await this.adapter.attachmentFiles(a.key);
        if (payload.status === "available") {
          available++;
          for (const file of payload.files) bytes += file.bytes;
        } else if (payload.status === "linked-url") linkedURLs++;
        else missing++;
      }
      const freeBytes = await this.adapter.availableBytes(parent);
      if (!Number.isSafeInteger(bytes) || bytes < 0)
        throw new Error("Could not estimate attachment size.");
      const requiredBytes = bytes + 128 * 1024 * 1024;
      if (freeBytes >= 0 && freeBytes < requiredBytes)
        throw new Error("Not enough disk space for the files plus a 128 MiB safety margin.");
      if (signal.aborted) throw new Error("Cancelled");
      const name = `zotero-reader-${this.now().toISOString().replace(/[:.]/g, "-")}-${this.suffix()}`;
      this.update({
        phase: "ready",
        destination: this.join(parent, name),
        plan: {
          sources: snapshot.items.length,
          notes: snapshot.notes.length,
          annotations: snapshot.annotations.length,
          collections: snapshot.collections.length,
          attachments: snapshot.attachments.length,
          available,
          missing,
          linkedURLs,
          bytes,
          freeBytes,
        },
        message: missing
          ? `${missing} attachments are unavailable. Their metadata will be retained and reported.`
          : "Ready to export. Original Zotero data will not be changed.",
      });
    } catch (error) {
      this.update({
        phase: signal.aborted ? "cancelled" : "failed",
        message: signal.aborted
          ? "Scan cancelled. No bundle was created."
          : String(error.message || error),
      });
    }
  }
  async start() {
    if (this.disposed || this.state.phase !== "ready") return;
    this.abort = new this.AbortController();
    const signal = this.abort.signal;
    this.update({
      phase: "exporting",
      completed: 0,
      message: "Exporting metadata and verifying original files…",
    });
    this.job = this.run(signal);
    await this.job;
  }
  async run(signal) {
    try {
      // Recheck space immediately before the first write, not only at folder selection.
      const free = await this.adapter.availableBytes(this.state.parent);
      if (free >= 0 && free < this.state.plan.bytes + 128 * 1024 * 1024)
        throw new Error("Not enough free disk space. Choose another folder.");
      const manifest = await this.api.exportLibrary(this.adapter, {
        destination: this.state.destination,
        signal,
        onProgress: ({ completed, total }) => this.update({ completed, total }),
      });
      this.update({
        phase: "complete",
        manifest,
        message: manifest.warnings.length
          ? `Export complete with ${manifest.warnings.length} warnings. Review the report below.`
          : "Export complete. Original files and checksums are preserved.",
      });
    } catch (error) {
      this.update({
        phase: signal.aborted ? "cancelled" : "failed",
        message: signal.aborted
          ? "Export cancelled. Any partial folder is not importable. Choose a folder to start a fresh export."
          : `${String(error.message || error)} Any partial folder is not importable; retry into a new folder.`,
      });
    }
  }
  cancel() {
    if (!this.busy) return;
    this.abort.abort();
    this.update({
      phase: "cancelling",
      message: "Cancelling after the current file operation finishes…",
    });
  }
  async dispose() {
    this.disposed = true;
    this.cancel();
    await this.job;
    this.listeners.clear();
  }
};
