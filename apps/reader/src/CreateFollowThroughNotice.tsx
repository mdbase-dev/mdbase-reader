import { plural, t as translate } from "@lingui/core/macro";
import { useLingui as useLocale } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { useCallback, useState, useSyncExternalStore, type JSX } from "react";

import { DeploymentUpdateNotice } from "./DeploymentUpdateNotice.js";

import type {
  CreateAttention,
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
        attention={creates.attention}
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

/** What happened to one create, in words for the user. */
export function createAttentionMessage(item: CreateAttention): string {
  return item.reason === "names-taken"
    ? translate`“${item.label}” could not be added to your collection: another record already uses each name Reader tried.`
    : translate`Your collection did not accept “${item.label}”. ${item.problem}`;
}

/**
 * Says what was not added and why, that the content is kept on this device, and
 * offers to try again or let it go. One create at a time, oldest first.
 */
export function CreateFollowThroughNotice({
  followThrough,
  attention,
  onHide,
}: {
  readonly followThrough: ReaderCreateFollowThrough;
  readonly attention: readonly CreateAttention[];
  readonly onHide: () => void;
}): JSX.Element | null {
  useLocale();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [stillRefused, setStillRefused] = useState<string | null>(null);
  const [first] = attention;
  if (!first) {
    return null;
  }
  const more = attention.length - 1;
  const tryAgain = (): void => {
    setBusy(true);
    setStillRefused(null);
    void followThrough
      .reconcile({ retry: true })
      .then(() => {
        if (followThrough.getSnapshot().attention.some(({ key }) => key === first.key)) {
          setStillRefused(first.key);
        }
      })
      .finally(() => setBusy(false));
  };
  const discard = (): void => {
    setBusy(true);
    setConfirming(null);
    void followThrough.discard(first.key).finally(() => setBusy(false));
  };
  return (
    <div className="create-follow-through">
      <p role="status">
        {createAttentionMessage(first)} <Trans>Its content is kept on this device.</Trans>
        {more > 0
          ? plural(more, { one: " # more item needs a look.", other: " # more items need a look." })
          : ""}
        {stillRefused === first.key ? translate({ message: " Trying again did not help." }) : ""}
      </p>
      {confirming === first.key ? (
        <div className="create-follow-through-actions">
          <span>{translate`Remove “${first.label}” from this device for good?`}</span>
          <button type="button" disabled={busy} onClick={discard}>
            <Trans>Discard</Trans>
          </button>
          <button type="button" onClick={() => setConfirming(null)}>
            <Trans>Keep</Trans>
          </button>
        </div>
      ) : (
        <div className="create-follow-through-actions">
          <button type="button" disabled={busy} onClick={tryAgain}>
            {busy
              ? translate({ message: "Trying…" })
              : translate({ message: "Try again", context: "Reader interface" })}
          </button>
          <button type="button" disabled={busy} onClick={() => setConfirming(first.key)}>
            <Trans>Discard…</Trans>
          </button>
          <button type="button" onClick={onHide}>
            <Trans>Hide</Trans>
          </button>
        </div>
      )}
    </div>
  );
}
