import { Trans, useLingui } from "@lingui/react/macro";
import { useCallback, useSyncExternalStore, type JSX } from "react";

import { Menu } from "./Menu.js";

import type { Mdbase } from "@mdbase-reader/connect/native";

const noop = (): void => undefined;

export function ReaderSaveStatus({
  mdbase,
}: {
  readonly mdbase: Mdbase | null;
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
  const writes = snapshot?.writes;
  if (!writes || (!writes.pending.length && !writes.rejected.length)) {
    return null;
  }
  const entries = [...writes.pending, ...writes.rejected];
  const label = writes.rejected.length
    ? t`Changes need attention`
    : t`${String(writes.pending.length)} pending`;
  return (
    <Menu
      className="reader-save-status"
      label={label}
      trigger={label}
      triggerClassName="reader-save-trigger"
    >
      <div className="reader-save-details">
        <p role="status">
          {writes.rejected.length
            ? t`The collection refused some changes. Review them before signing out.`
            : snapshot.saveWarning
              ? t`These changes have not reached the collection. This browser may remove its local copy.`
              : t`Waiting for the collection to confirm these changes.`}
        </p>
        <ul>
          {entries.map((entry) => (
            <li key={entry.mutationId}>
              <strong>{entry.problem?.message ?? t`Pending change`}</strong>
              <time dateTime={new Date(entry.createdAt).toISOString()}>
                {new Date(entry.createdAt).toLocaleTimeString()}
              </time>
              <code>{entry.mutationId}</code>
              {entry.records.length ? (
                <small>
                  {t`Record or file`}: {entry.records.join(", ")}
                </small>
              ) : null}
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => window.location.reload()}>
          <Trans>Reload Reader to check again</Trans>
        </button>
      </div>
    </Menu>
  );
}
