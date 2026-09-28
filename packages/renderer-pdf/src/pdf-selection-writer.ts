import type { SelectionCapability, SelectionRangeX } from "@embedpdf/plugin-selection";

/** EmbedPDF applies ranges asynchronously when it needs page geometry. Coalesce pointer moves,
 * and restore a newer external clear/selection if an older engine task lands after it. Aborting
 * the returned PdfTask alone does not cancel EmbedPDF's underlying geometry callback. */
export class PdfSelectionWriter {
  #pending: SelectionRangeX | null = null;
  #writing: SelectionRangeX | null = null;
  #external: { range: SelectionRangeX | null } | null = null;
  #applying: Promise<void> | null = null;
  #disposed = false;

  public constructor(
    private readonly selection: Pick<SelectionCapability, "setSelection" | "getState">,
  ) {}

  public queue(range: SelectionRangeX): void {
    if (this.#disposed) {
      return;
    }
    this.#pending = range;
    this.#start();
  }

  #start(): void {
    if (this.#applying || !this.#pending || this.#disposed) {
      return;
    }
    this.#applying = this.#flush()
      .catch(() => {
        this.#pending = null;
      })
      .finally(() => {
        this.#applying = null;
        this.#writing = null;
        this.#external = null;
        // A move can arrive after flush's last await but before this finalizer.
        this.#start();
      });
  }

  /** Distinguish our updates from external selection changes, which interrupt a drag. */
  public observe(range: SelectionRangeX | null): "owned" | "external" | "obsolete" {
    if (!this.#writing) {
      return "external";
    }
    if (sameRange(range, this.#writing)) {
      return this.#external === null ? "owned" : "obsolete";
    }
    this.#external = { range };
    this.#pending = null;
    return "external";
  }

  public async settled(): Promise<void> {
    while (this.#applying) {
      await this.#applying;
    }
  }
  public dispose(): void {
    this.#disposed = true;
    this.#pending = null;
  }

  async #flush(): Promise<void> {
    while (this.#pending && !this.#disposed) {
      const range = this.#pending;
      this.#pending = null;
      this.#writing = range;
      await this.selection.setSelection(range).toPromise();
      const external = this.#external;
      this.#writing = null;
      this.#external = null;
      if (external) {
        await this.#restoreIfCurrent(external.range, range);
      }
    }
  }

  async #restoreIfCurrent(
    replacement: SelectionRangeX | null,
    obsolete: SelectionRangeX,
  ): Promise<void> {
    if (!this.#disposed && sameRange(this.selection.getState().selection, obsolete)) {
      await this.selection.setSelection(replacement).toPromise();
    }
  }
}

function sameRange(a: SelectionRangeX | null, b: SelectionRangeX): boolean {
  return (
    a?.start.page === b.start.page &&
    a.start.index === b.start.index &&
    a.end.page === b.end.page &&
    a.end.index === b.end.index
  );
}
