import { Trans, useLingui } from "@lingui/react/macro";
import { useCallback, useContext, useSyncExternalStore, type JSX } from "react";

import { Menu } from "./Menu.js";
import { ReaderSyncConflicts } from "./ReaderSyncConflicts.js";
import { sdkOffline, sdkSyncIncidents } from "./sdk-connection-state.js";
import { SourceLibraryContext } from "./SourceLibraryContext.js";

import type {
  Mdbase,
  MdbaseApplicationConnection,
  MdbaseSnapshot,
} from "@mdbase-reader/connect/native";

const noop = (): void => undefined;
type Writes = NonNullable<NonNullable<MdbaseSnapshot["sync"]>["writes"]>;

export function ReaderSaveStatus({
  mdbase,
  online: _browserOnline,
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
  const { pending, rejected } = snapshot?.sync?.writes ?? { pending: [], rejected: [] };
  const incidents = sdkSyncIncidents(snapshot);
  const conflicts = snapshot?.sync?.conflicts ?? 0;
  const holds = snapshot?.sync?.holds ?? 0;
  const needsAttention = rejected.length + incidents.length + conflicts + holds > 0;
  if (!pending.length && !needsAttention) {
    return null;
  }
  const label = needsAttention ? t`Changes need attention` : t`${String(pending.length)} pending`;
  return (
    <Menu
      className="reader-save-status"
      label={label}
      trigger={label}
      triggerClassName="reader-save-trigger"
    >
      <SaveStatusDetails
        snapshot={snapshot}
        pending={pending}
        rejected={rejected}
        incidents={incidents}
        conflicts={conflicts}
        holds={holds}
      />
    </Menu>
  );
}

function SaveStatusDetails({
  snapshot,
  pending,
  rejected,
  incidents,
  conflicts,
  holds,
}: Pick<Writes, "pending" | "rejected"> & {
  readonly snapshot: MdbaseSnapshot | null;
  readonly incidents: ReturnType<typeof sdkSyncIncidents>;
  readonly conflicts: number;
  readonly holds: number;
}): JSX.Element {
  const online = !sdkOffline(snapshot);
  const connection = openConnection(snapshot);
  const entries = [...pending, ...rejected];
  const stalled = snapshot?.sync?.pendingFor === "long";
  return (
    <div className="reader-save-details">
      {entries.length + incidents.length > 0 ? (
        <SaveStatusMessage
          incidents={incidents.length}
          pending={pending.length}
          refused={rejected.length}
          storageWarning={online && Boolean(snapshot?.saveWarning)}
        />
      ) : null}
      {connection && conflicts + holds > 0 ? (
        <ReaderSyncConflicts
          key={connection.generation}
          connection={connection}
          hasConflicts={conflicts > 0}
          hasHolds={holds > 0}
        />
      ) : null}
      <SyncIncidentList incidents={incidents} />
      {entries.length ? <SaveStatusEntries entries={entries} connection={connection} /> : null}
      {online && (stalled || incidents.length > 0) ? (
        <button
          className="connection-secondary"
          type="button"
          onClick={() => window.location.reload()}
        >
          <Trans>Reload Reader to check again</Trans>
        </button>
      ) : null}
    </div>
  );
}

function openConnection(snapshot: MdbaseSnapshot | null): MdbaseApplicationConnection | null {
  const phase = snapshot?.phase;
  return phase?.kind === "ready" || phase?.kind === "unsynced" ? phase.connection : null;
}

function SaveStatusEntries({
  entries,
  connection,
}: {
  readonly connection: MdbaseApplicationConnection | null;
  readonly entries: Writes["pending"];
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
                source.replicaId === record ||
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
              {entry.state === "rejected" && connection ? (
                <button
                  className="connection-secondary"
                  type="button"
                  onClick={() => {
                    if (connection.isCurrent()) {
                      void connection.records.ledger.acknowledge(entry.mutationId);
                    }
                  }}
                >
                  <Trans context="Reader interface">Dismiss</Trans>
                </button>
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
          if (typeof details === "object" && details !== null && !Array.isArray(details)) {
            for (const [key, value] of Object.entries(details)) {
              if (["service_code", "code", "reason"].includes(key) && typeof value === "string") {
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
