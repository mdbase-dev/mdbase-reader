import { i18n } from "@lingui/core";
import { plural } from "@lingui/core/macro";
import { Plural, Trans, useLingui } from "@lingui/react/macro";

import type { ImportController, ImportState } from "./import-controller.js";
import type { ReaderConnectedCollection } from "@mdbase-reader/connect";
import type { MigrationPlan } from "@mdbase-reader/migration";
import type { JSX } from "react";
export function ImportPreview({ plan }: { plan: MigrationPlan }): JSX.Element {
  const { t } = useLingui();
  return (
    <section className="import-step" aria-labelledby="import-preview-title">
      <h2 id="import-preview-title">
        <Trans>Review what will be imported</Trans>
      </h2>
      <dl className="import-counts">
        <div>
          <dt>
            <Trans>Sources</Trans>
          </dt>
          <dd>{plan.sources.length.toLocaleString(i18n.locale)}</dd>
        </div>
        <div>
          <dt>
            <Trans>Annotations and notes</Trans>
          </dt>
          <dd>{plan.annotations.length.toLocaleString(i18n.locale)}</dd>
        </div>
        <div>
          <dt>
            <Trans>Content files</Trans>
          </dt>
          <dd>{plan.summary.files.toLocaleString(i18n.locale)}</dd>
        </div>
        <div>
          <dt>
            <Trans>Content size</Trans>
          </dt>
          <dd>
            {plan.summary.bytes === null
              ? t({ message: "Calculated during download" })
              : t`${(plan.summary.bytes / 1024 ** 3).toLocaleString(i18n.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} GiB`}
          </dd>
        </div>
      </dl>
      {plan.summary.categories?.length ? (
        <table className="import-categories">
          <caption>
            <Trans>By category</Trans>
          </caption>
          <thead>
            <tr>
              <th scope="col">
                <Trans>Category</Trans>
              </th>
              <th scope="col">
                <Trans>Sources</Trans>
              </th>
              <th scope="col">
                <Trans>Annotations and notes</Trans>
              </th>
            </tr>
          </thead>
          <tbody>
            {plan.summary.categories.map((c) => (
              <tr key={c.label}>
                <th scope="row">{c.label}</th>
                <td>{c.sources.toLocaleString(i18n.locale)}</td>
                <td>{c.annotations.toLocaleString(i18n.locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <p>
        <Trans>
          Native metadata is also archived as JSON. Existing records matched by import identity are
          kept unchanged; ambiguous title or URL matches are never silently merged.
        </Trans>
      </p>
      <details>
        <summary>
          <Plural
            value={plan.warnings.length}
            one="# warning and fidelity note"
            other="# warnings and fidelity notes"
          />
        </summary>
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
  const { t } = useLingui();
  const { plan, preview, boundTarget, busy, result } = state;
  const collectionName = opened.collectionName;
  if (!plan) {
    return null;
  }
  const ready =
    preview?.collectionId === opened.collectionId &&
    (!boundTarget || boundTarget === opened.collectionId);
  return (
    <section className="import-step" aria-labelledby="import-confirm-title">
      <h2 id="import-confirm-title">
        <Trans>Confirm</Trans>
      </h2>
      <button type="button" disabled={busy || !!boundTarget} onClick={controller.inspect}>
        {t`Check destination: ${opened.collectionName}`}
      </button>
      {ready ? (
        <>
          <p>
            <Trans>
              {preview.newRecords.toLocaleString(i18n.locale)}
              new records; {preview.existingRecords.toLocaleString(i18n.locale)}
              already imported. No existing records will be overwritten.
            </Trans>
          </p>
          <button
            className="import-primary"
            type="button"
            disabled={busy || !!result}
            onClick={controller.start}
          >
            {boundTarget
              ? t({ message: "Resume import", context: "ImportReview interface" })
              : t({
                  message: plural(plan.sources.length, {
                    one: `Import # source into ${collectionName}`,
                    other: `Import # sources into ${collectionName}`,
                  }),
                })}
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
  const { t } = useLingui();
  const { progress, result, message, error, busy, boundTarget } = state;
  const query = new URLSearchParams(location.search);
  if (result) {
    query.set("collection", result.collectionId);
  }
  return (
    <section
      className="import-status"
      aria-label={t({ message: "Import status", context: "ImportReview interface" })}
    >
      <p role="status" aria-live="polite">
        {message}
      </p>
      {error ? <p role="alert">{error}</p> : null}
      {progress ? (
        <>
          <progress
            value={progress.completed}
            max={progress.total}
            aria-label={t({ message: "Import progress", context: "ImportReview interface" })}
          />
          <p>
            <Trans>
              Steps: {progress.completed.toLocaleString(i18n.locale)} /{" "}
              {progress.total.toLocaleString(i18n.locale)} · Created:{" "}
              {progress.created.toLocaleString(i18n.locale)} · Kept:{" "}
              {progress.skipped.toLocaleString(i18n.locale)}
            </Trans>
            {progress.transferredBytes
              ? t` · ${(progress.transferredBytes / 1024 ** 2).toLocaleString(i18n.locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MiB latest file progress`
              : ""}
          </p>
        </>
      ) : null}
      {busy ? (
        <button type="button" onClick={controller.stop}>
          <Trans>Stop safely</Trans>
        </button>
      ) : null}
      {boundTarget ? (
        <p>
          <Trans>
            The job is bound to its confirmed collection. Switching collections cannot redirect it.
            Keep this tab open; after a reload, reselect the same bundle (or reconnect Readwise),
            choose the same collection, and scan again to resume.
          </Trans>
        </p>
      ) : null}
      {result ? (
        <p>
          <Trans>
            <a href={`${import.meta.env.BASE_URL}?${query.toString()}`}>
              Open imported collection →
            </a>
          </Trans>
        </p>
      ) : null}
    </section>
  );
}
