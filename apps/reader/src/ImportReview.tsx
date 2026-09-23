import type { ImportController, ImportState } from "./import-controller.js";
import type { ReaderConnectedCollection } from "@mdbase-reader/connect";
import type { MigrationPlan } from "@mdbase-reader/migration";
import type { JSX } from "react";
export function ImportPreview({ plan }: { plan: MigrationPlan }): JSX.Element {
  return (
    <section className="import-step" aria-labelledby="import-preview-title">
      <h2 id="import-preview-title">Review what will be imported</h2>
      <dl className="import-counts">
        <div>
          <dt>Sources</dt>
          <dd>{plan.sources.length.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Annotations and notes</dt>
          <dd>{plan.annotations.length.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Content files</dt>
          <dd>{plan.summary.files.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Content size</dt>
          <dd>
            {plan.summary.bytes === null
              ? "Calculated during download"
              : `${(plan.summary.bytes / 1024 ** 3).toFixed(2)} GiB`}
          </dd>
        </div>
      </dl>
      <p>
        Native metadata is also archived as JSON. Existing records matched by import identity are
        kept unchanged; ambiguous title or URL matches are never silently merged.
      </p>
      <details>
        <summary>{plan.warnings.length} warnings and fidelity notes</summary>
        <ul>
          {plan.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}
export function ImportConfirm({
  state,
  opened,
  controller,
}: {
  state: ImportState;
  opened: ReaderConnectedCollection;
  controller: ImportController;
}): JSX.Element | null {
  const { plan, preview, boundTarget, busy, result } = state;
  if (!plan) {
    return null;
  }
  const ready =
    preview?.collectionId === opened.collectionId &&
    (!boundTarget || boundTarget === opened.collectionId);
  return (
    <section className="import-step" aria-labelledby="import-confirm-title">
      <h2 id="import-confirm-title">Confirm</h2>
      <button type="button" disabled={busy || !!boundTarget} onClick={controller.inspect}>
        Check destination: {opened.collectionName}
      </button>
      {ready ? (
        <>
          <p>
            {preview.newRecords.toLocaleString()} new records;{" "}
            {preview.existingRecords.toLocaleString()} already imported. No existing records will be
            overwritten.
          </p>
          <button
            className="import-primary"
            type="button"
            disabled={busy || !!result}
            onClick={controller.start}
          >
            {boundTarget
              ? "Resume import"
              : `Import ${plan.sources.length.toLocaleString()} sources into ${opened.collectionName}`}
          </button>
        </>
      ) : null}
    </section>
  );
}
export function ImportStatus({
  state,
  controller,
}: {
  state: ImportState;
  controller: ImportController;
}): JSX.Element {
  const { progress, result, message, error, busy, boundTarget } = state;
  const query = new URLSearchParams(location.search);
  if (result) {
    query.set("collection", result.collectionId);
  }
  return (
    <section className="import-status" aria-label="Import status">
      <p role="status" aria-live="polite">
        {message}
      </p>
      {error ? <p role="alert">{error}</p> : null}
      {progress ? (
        <>
          <progress value={progress.completed} max={progress.total} aria-label="Import progress" />
          <p>
            {progress.completed.toLocaleString()} / {progress.total.toLocaleString()} steps ·{" "}
            {progress.created.toLocaleString()} created · {progress.skipped.toLocaleString()} kept
            {progress.transferredBytes
              ? ` · ${(progress.transferredBytes / 1024 ** 2).toFixed(1)} MiB latest file progress`
              : ""}
          </p>
        </>
      ) : null}
      {busy ? (
        <button type="button" onClick={controller.stop}>
          Stop safely
        </button>
      ) : null}
      {boundTarget ? (
        <p>
          The job is bound to its confirmed collection. Switching collections cannot redirect it.
          Keep this tab open; after a reload, reselect the same bundle (or reconnect Readwise),
          choose the same collection, and scan again to resume.
        </p>
      ) : null}
      {result ? (
        <p>
          <a href={`${import.meta.env.BASE_URL}?${query.toString()}`}>Open imported collection →</a>
        </p>
      ) : null}
    </section>
  );
}
