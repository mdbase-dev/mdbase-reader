import { useCallback, useState, useSyncExternalStore, type JSX } from "react";

import { DeploymentUpdateNotice } from "./DeploymentUpdateNotice.js";

import type {
  CreateFollowThroughSnapshot,
  ReaderCreateFollowThrough,
} from "@mdbase-reader/connect";

const settled: CreateFollowThroughSnapshot = { waiting: 0, attention: [] };
const noFollowThrough = (): (() => void) => () => undefined;

/** The creates the collection could not take, or `settled` without follow-through. */
export function useCreateFollowThrough(
  followThrough: ReaderCreateFollowThrough | undefined,
): CreateFollowThroughSnapshot {
  const subscribe = useCallback(
    (listener: () => void) => followThrough?.subscribe(listener) ?? noFollowThrough(),
    [followThrough],
  );
  return useSyncExternalStore(subscribe, () => followThrough?.getSnapshot() ?? settled);
}

/**
 * The notices above the header: a newer deployment, and creates that need the
 * user. Null when there are none. Hiding the create notice lasts until another
 * create needs the user.
 */
export function useShellNotices(
  deploymentUpdateAvailable: boolean,
  followThrough: ReaderCreateFollowThrough | undefined,
): JSX.Element | null {
  const creates = useCreateFollowThrough(followThrough);
  const [hidden, setHidden] = useState<string | null>(null);
  const shown = creates.attention.map(({ key }) => key).join("\n");
  const createNotice =
    followThrough && shown !== "" && shown !== hidden ? (
      <CreateFollowThroughNotice
        followThrough={followThrough}
        snapshot={creates}
        onHide={() => setHidden(shown)}
      />
    ) : null;
  if (!deploymentUpdateAvailable && !createNotice) {
    return null;
  }
  return (
    <div className="shell-notices">
      {deploymentUpdateAvailable ? <DeploymentUpdateNotice /> : null}
      {createNotice}
    </div>
  );
}

/**
 * Says, without alarm, that something saved on this device has not reached the
 * collection yet and is kept here until it does.
 */
export function CreateFollowThroughNotice({
  followThrough,
  snapshot,
  onHide,
}: {
  readonly followThrough: ReaderCreateFollowThrough;
  readonly snapshot: CreateFollowThroughSnapshot;
  readonly onHide: () => void;
}): JSX.Element | null {
  const [trying, setTrying] = useState(false);
  const [first] = snapshot.attention;
  if (!first) {
    return null;
  }
  const count = snapshot.attention.length;
  const what =
    count === 1
      ? `“${first.label}” is not in your collection yet.`
      : `${String(count)} items are not in your collection yet.`;
  return (
    <div className="deployment-update create-follow-through" role="status">
      <span title={count === 1 ? first.problem : undefined}>
        {what} {count === 1 ? "It is" : "They are"} kept safely on this device.
      </span>
      <button
        type="button"
        disabled={trying}
        onClick={() => {
          setTrying(true);
          void followThrough.reconcile({ retry: true }).finally(() => setTrying(false));
        }}
      >
        {trying ? "Trying…" : "Try again"}
      </button>
      <button type="button" onClick={onHide}>
        Hide
      </button>
    </div>
  );
}
