import { Trans } from "@lingui/react/macro";
import { useEffect, useState, type JSX } from "react";

import type { MdbaseApplicationConnection } from "@mdbase-reader/connect/native";

type Client = MdbaseApplicationConnection["records"];
type Conflicts = Awaited<ReturnType<Client["listConflicts"]>>;
type Holds = Awaited<ReturnType<Client["listHolds"]>>;
type ConflictValue = Conflicts[number]["conflict"]["kept"];

export function ReaderSyncConflicts({
  connection,
  hasConflicts,
  hasHolds,
}: {
  readonly connection: MdbaseApplicationConnection;
  readonly hasConflicts: boolean;
  readonly hasHolds: boolean;
}): JSX.Element {
  const client = connection.records;
  const [conflicts, setConflicts] = useState<Conflicts>([]);
  const [holds, setHolds] = useState<Holds>([]);
  useEffect(
    () => (hasConflicts ? client.onConflicts(setConflicts) : undefined),
    [client, hasConflicts],
  );
  useEffect(() => (hasHolds ? client.onHolds(setHolds) : undefined), [client, hasHolds]);
  return (
    <>
      <p role="status">
        <Trans>Some changes need review after sync. Compare the preserved versions below.</Trans>
      </p>
      <ul className="reader-sync-versions">
        {hasConflicts &&
          conflicts.map(({ mutation, conflict }) => (
            <li key={JSON.stringify([mutation, conflict.id, conflict.kind, conflict.field])}>
              <details>
                <summary>
                  <code>{conflict.field ?? conflict.kind}</code> · <code>{conflict.id}</code>
                </summary>
                <p>
                  <Trans>Version kept during sync</Trans>
                </p>
                <pre>{conflictText(conflict.kept)}</pre>
                <p>
                  <Trans>Other version</Trans>
                </p>
                <pre>{conflictText(conflict.lost)}</pre>
              </details>
            </li>
          ))}
        {hasHolds &&
          holds.map((hold) => (
            <li key={hold.id}>
              <details>
                <summary>{hold.path}</summary>
                <p>
                  <Trans>Protected local edit</Trans>
                </p>
                <pre>
                  {typeof hold.mine === "string" ? hold.mine : JSON.stringify(hold.mine, null, 2)}
                </pre>
                {hold.theirs !== undefined ? (
                  <>
                    <p>
                      <Trans>Collection version</Trans>
                    </p>
                    <pre>
                      {typeof hold.theirs === "string"
                        ? hold.theirs
                        : JSON.stringify(hold.theirs, null, 2)}
                    </pre>
                  </>
                ) : null}
              </details>
            </li>
          ))}
      </ul>
    </>
  );
}

function conflictText(value: ConflictValue): string {
  if (value.form === "text") {
    return value.text;
  }
  if (value.form === "value") {
    return typeof value.value === "string" ? value.value : JSON.stringify(value.value, null, 2);
  }
  return JSON.stringify(value, null, 2);
}
