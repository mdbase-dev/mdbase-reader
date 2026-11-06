import { Trans, useLingui } from "@lingui/react/macro";
import { useCallback, useContext, useSyncExternalStore, type JSX } from "react";

import { Menu } from "./Menu.js";
import { sdkSyncIncidents } from "./sdk-connection-state.js";
import { SourceLibraryContext } from "./SourceLibraryContext.js";
import { useSustained } from "./use-sustained.js";

import type { Mdbase, MdbaseSnapshot } from "@mdbase-reader/connect/native";

const noop = (): void => undefined;

export function ReaderSaveStatus({
  mdbase,
  online: browserOnline,
}: {
  readonly mdbase: Mdbase | null;
  readonly online: boolean;
}): JSX.Element | null {
  const { t } = useLingui();
  const subscribe = useCallback(
    (listener: () => void) => mdbase?.subscribe(listener) ?? noop,
    [mdbase],
  );
  const snapshot = useSyncExternalStore(
    subscribe,
    () => mdbase?.getSnapshot() ?? null,
    () => null,
  );
  const online = browserOnline && snapshot?.sync?.kind !== "offline";
  const { pending, rejected } = snapshot?.writes ?? { pending: [], rejected: [] };
  const incidents = sdkSyncIncidents(snapshot);
  const needsAttention = rejected.length + incidents.length > 0;
  const stalled = useSustained(online && Boolean(pending.length), 30_000);
  if (!pending.length && !needsAttention) {
    return null;
  }
  const entries = [...pending, ...rejected];
  const label = needsAttention ? t`Changes need attention` : t`${String(pending.length)} pending`;
  return (
    <Menu
      className="reader-save-status"
      label={label}
      trigger={label}
      triggerClassName="reader-save-trigger"
    >
      <div className="reader-save-details">
        <SaveStatusMessage
          incidents={incidents.length}
          pending={pending.length}
          refused={rejected.length}
          storageWarning={online && Boolean(snapshot?.saveWarning)}
        />
        <SyncIncidentList incidents={incidents} />
        <SaveStatusEntries entries={entries} />
        {online && (stalled || needsAttention) ? (
          <button
            className="connection-secondary"
            type="button"
            onClick={() => window.location.reload()}
          >
            <Trans>Reload Reader to check again</Trans>
          </button>
        ) : null}
      </div>
    </Menu>
  );
}

function SaveStatusEntries({
  entries,
}: {
  readonly entries: NonNullable<MdbaseSnapshot["writes"]>["pending"];
}): JSX.Element {
  const { t } = useLingui();
  const sources = useContext(SourceLibraryContext);
  return (
    <ul>
      {entries.map((entry) => {
        const title = sources
          .filter((source) =>
            entry.records.some(
              (record) =>
                source.id === record ||
                source.documents.some((document) => document.fileId === record),
            ),
          )
          .map((source) => source.title)
          .join(", ");
        return (
          <li key={entry.mutationId}>
            <strong>
              {title
                ? t`Changes to ${title}`
                : entry.problem
                  ? t`Change needs attention`
                  : t`Changes awaiting confirmation`}
            </strong>
            <span>{entry.problem ? t`Change needs attention` : t`Waiting for confirmation`}</span>
            <time dateTime={new Date(entry.createdAt).toISOString()}>
              {new Date(entry.createdAt).toLocaleTimeString()}
            </time>
            <details>
              <summary>
                <Trans context="Reader interface">Details</Trans>
              </summary>
              <code>{entry.mutationId}</code>
              {entry.problem ? <p>{entry.problem.message}</p> : null}
              {entry.problem?.recovery === "contact_support" ? (
                <p>
                  <Trans>Contact support about this change. Keep this browser’s data.</Trans>
                </p>
              ) : null}
              {entry.records.length ? (
                <small>
                  {t`Record or file`}: {entry.records.join(", ")}
                </small>
              ) : null}
            </details>
          </li>
        );
      })}
    </ul>
  );
}

function SaveStatusMessage({
  incidents,
  pending,
  refused,
  storageWarning,
}: {
  readonly incidents: number;
  readonly pending: number;
  readonly refused: number;
  readonly storageWarning: boolean;
}): JSX.Element {
  const { t } = useLingui();
  const message = refused
    ? pending
      ? t`The collection refused some changes. Other changes are still pending on this device. Review them before signing out.`
      : t`The collection refused these changes. Review them before signing out.`
    : !pending && incidents
      ? t`You can keep reading. Sync needs attention; keep this browser’s data until it is resolved.`
      : storageWarning
        ? t`These changes have not reached the collection. This browser may remove its local copy.`
        : t`These changes are still pending on this device. Waiting for the collection to confirm them.`;
  return <p role="status">{message}</p>;
}

function SyncIncidentList({
  incidents,
}: {
  readonly incidents: ReturnType<typeof sdkSyncIncidents>;
}): JSX.Element | null {
  if (!incidents.length) {
    return null;
  }
  return (
    <details>
      <summary>
        <Trans context="Reader interface">Details</Trans>
      </summary>
      <ul className="reader-sync-incidents">
        {incidents.map((incident, index) => {
          const details = incident.details;
          const fields: JSX.Element[] = [];
          if (details instanceof Map) {
            for (const [key, value] of details) {
              if (
                typeof key === "string" &&
                ["service_code", "code", "reason"].includes(key) &&
                typeof value === "string"
              ) {
                fields.push(<code key={key}>{value}</code>);
              }
            }
          }
          return (
            <li key={`${incident.kind}-${String(index)}`}>
              <code>{incident.kind}</code>
              {fields}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
