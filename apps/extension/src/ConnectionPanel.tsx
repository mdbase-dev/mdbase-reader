import { t } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { Select } from "@mdbase-dev/ui/select";

import { environment } from "./environment.js";

import type { ExtensionCaptureController } from "./capture-controller.js";
import type { ConnectionView } from "./connection-view.js";
import type { ProblemKind } from "./use-action-lock.js";

/** What the connection controls need; the panel, welcome and settings pages all provide it. */
export type ConnectionControls = Pick<
  ExtensionCaptureController,
  "snapshot" | "busy" | "connect" | "retry" | "applySetup" | "select"
>;

export function ConnectionPanel({
  compact = false,
  expanded = false,
  onDone,
  ...props
}: ConnectionPanelProps & {
  /**
   * Once connected, show nothing: the header names the collection, and its Change button
   * sets `expanded` to show these controls until `onDone`.
   */
  readonly compact?: boolean;
  readonly expanded?: boolean;
  readonly onDone?: () => void;
}): React.JSX.Element | null {
  const { snapshot } = props.controller;
  const collapsible = compact && snapshot.status === "ready";
  if (collapsible && !expanded) {
    return null;
  }
  return (
    <ConnectionControlsPanel
      {...props}
      done={
        collapsible && onDone ? (
          <button
            type="button"
            className="text-button collapse-button"
            aria-expanded="true"
            onClick={onDone}
          >
            <Trans>Done</Trans>
          </button>
        ) : null
      }
    />
  );
}

interface ConnectionPanelProps {
  readonly controller: ConnectionControls;
  readonly label?: string;
  readonly intro?: string;
}

/** The selected collection's name, once one is connected and chosen. */
export function collectionName(controller: ConnectionControls): string | null {
  const { snapshot } = controller;
  if (snapshot.status !== "ready") {
    return null;
  }
  return (
    snapshot.collections.find((collection) => collection.collectionId === snapshot.collectionId)
      ?.displayName ?? t`your collection`
  );
}

/** The collections this extension may use, once signed in. */
function CollectionChoice({
  controller: c,
  label,
}: {
  readonly controller: ConnectionControls;
  readonly label: string;
}): React.JSX.Element {
  const { t } = useLingui();
  const { snapshot, busy } = c;
  return (
    <>
      <span className="field-label" id="collection-label">
        {label}
      </span>
      <Select
        className="collection-select"
        aria-labelledby="collection-label"
        value={snapshot.collectionId ?? ""}
        placeholder={t`Choose a collection`}
        disabled={busy}
        options={snapshot.collections.map((collection) => ({
          value: collection.collectionId,
          label: collection.displayName,
        }))}
        onChange={(id) => c.select(id)}
      />
      <button
        className="text-button"
        type="button"
        disabled={busy}
        onClick={() => void c.connect(true)}
      >
        <Trans>Connect another collection</Trans>
      </button>
    </>
  );
}

/** One screen per SDK state: what is happening, and the one action that moves it on. */
function StateScreen({
  controller: c,
  intro,
}: {
  readonly controller: ConnectionControls;
  readonly intro: string;
}): React.JSX.Element | null {
  const { t } = useLingui();
  const { snapshot, busy } = c;
  const target = environment.label ? ` ${environment.label}` : "";
  const primary = (label: string, run: () => Promise<void>): React.JSX.Element => (
    <button className="primary" type="button" disabled={busy} onClick={() => void run()}>
      {label}
    </button>
  );
  switch (snapshot.status) {
    case "opening":
      return (
        <p role="status">
          <Trans>Opening mdbase…</Trans>
        </p>
      );
    case "signed_out":
    case "closed":
      return (
        <>
          <h2>
            <Trans>Connect a collection</Trans>
          </h2>
          <p>{snapshot.status === "closed" ? t`Reader has signed out.` : intro}</p>
          {primary(busy ? t`Connecting…` : t`Connect to mdbase${target}`, () => c.connect())}
        </>
      );
    case "waiting":
      return (
        <>
          <p role="status" className="device-code">
            <Trans>Approve mdbase Reader in the mdbase tab, then return here.</Trans>
          </p>
          <button className="primary" type="button" onClick={() => void c.connect()}>
            <Trans>Sign in</Trans>
          </button>
        </>
      );
    case "choosing":
      return snapshot.collections.length ? null : (
        <>
          <h2>
            <Trans>Choose a collection</Trans>
          </h2>
          <p>{intro}</p>
          {primary(t`Choose a collection`, () => c.connect(true))}
        </>
      );
    case "approval":
      return (
        <>
          <p>
            <Trans>This collection needs you to approve mdbase Reader for it.</Trans>
          </p>
          {primary(t`Approve access`, () => c.connect())}
        </>
      );
    case "setup":
      return (
        <>
          <h2>
            <Trans>Prepare this collection</Trans>
          </h2>
          <p>
            <Trans>Reader needs its source and annotation definitions in this collection.</Trans>
          </p>
          {primary(t`Set up collection`, c.applySetup)}
        </>
      );
    case "unchecked":
      return (
        <>
          <p>
            <Trans>This collection hasn’t been checked yet. Check it before saving.</Trans>
          </p>
          {primary(t`Check again`, c.retry)}
        </>
      );
    case "problem":
      return <ProblemScreen problem={snapshot.problem} controller={c} />;
    default:
      return null;
  }
}

function ProblemScreen({
  problem,
  controller: c,
}: {
  readonly problem: ConnectionView["problem"];
  readonly controller: ConnectionControls;
}): React.JSX.Element {
  const { t } = useLingui();
  return (
    <div role="alert">
      <h2>{problem?.title ?? t`This collection can’t be used right now`}</h2>
      <p>{problem?.message}</p>
      {problem?.action && problem.actionLabel ? (
        <button
          className="primary"
          type="button"
          // Sign-in stays available while a refused or expired one is still authorizing.
          disabled={c.busy && problem.action !== "sign_in"}
          onClick={() => void c.retry()}
        >
          {problem.actionLabel}
        </button>
      ) : null}
    </div>
  );
}

function ConnectionControlsPanel({
  controller: c,
  label = t`Save to collection`,
  intro = t`Choose the mdbase collection to save into. Nothing is saved until you press Save.`,
  done,
}: ConnectionPanelProps & { readonly done?: React.ReactNode }): React.JSX.Element {
  const { t } = useLingui();
  const { snapshot } = c;
  const choose =
    snapshot.collections.length > 0 &&
    !["opening", "waiting", "signed_out", "closed"].includes(snapshot.status);
  return (
    <section className="action-panel" aria-label={t`Collection`}>
      {done}
      {choose ? <CollectionChoice controller={c} label={label} /> : null}
      <StateScreen controller={c} intro={intro} />
    </section>
  );
}

/**
 * The kind of problem to report, if any. A page the tab shows but Reader cannot read is not
 * a failure: the panel says so quietly instead (see CaptureApp's UnreadablePage).
 */
function shownProblemKind(c: ExtensionCaptureController): ProblemKind | null {
  const kind = c.problemKind ?? "connection";
  return !c.problem || (kind === "page" && !c.capture) ? null : kind;
}

export function ConnectionProblem({
  controller: c,
}: {
  readonly controller: ExtensionCaptureController;
}): React.JSX.Element | null {
  const kind = shownProblemKind(c);
  if (!kind || !c.problem) {
    return null;
  }
  const originDenied = /origin.*not allowed|origin_denied/iu.test(c.problem);
  return (
    <section className="problem" role="alert">
      <strong>{problemTitle(c, kind)}</strong>
      {c.saveAttempted && !c.source ? (
        <p>
          <Trans>Retry Save to check for an existing source before creating anything else.</Trans>
        </p>
      ) : null}
      <p>{c.problem}</p>
      {originDenied ? (
        <details className="technical">
          <summary>
            <Trans>Technical details</Trans>
          </summary>
          <p>
            <Trans>
              Connect rejected this extension’s origin. Reload the current extension build and
              retry. If it persists, check the {environment.label || "mdbase"} Connect
              configuration; Reader will not bypass the origin check.
            </Trans>
          </p>
        </details>
      ) : null}
      {kind === "page" ? (
        <p>
          <Trans>
            Reload the page, then press the mdbase Reader toolbar button again. Some pages, such as
            the Chrome Web Store and browser settings, cannot be read by extensions.
          </Trans>
        </p>
      ) : (
        <p>
          <Trans>
            Your selection and note are kept for this browser session, even if you close the panel.
          </Trans>
        </p>
      )}
      <ProblemActions controller={c} kind={kind} />
    </section>
  );
}

function ProblemActions({
  controller: c,
  kind,
}: {
  readonly controller: ExtensionCaptureController;
  readonly kind: NonNullable<ExtensionCaptureController["problemKind"]>;
}): React.JSX.Element {
  // The SDK's own problem names its one way out; Review access would not help.
  const sdkProblem = c.snapshot.status === "problem" ? c.snapshot.problem : null;
  return (
    <div className="problem-actions">
      {kind === "save" ? (
        <button type="button" disabled={c.busy} onClick={() => void c.save()}>
          <Trans>Retry save</Trans>
        </button>
      ) : null}
      {kind === "page" ? null : sdkProblem?.action && sdkProblem.actionLabel ? (
        <button
          type="button"
          disabled={c.busy && sdkProblem.action !== "sign_in"}
          onClick={() => void c.retry()}
        >
          {sdkProblem.actionLabel}
        </button>
      ) : kind === "connection" ? (
        <button type="button" disabled={c.busy} onClick={() => void c.retry()}>
          <Trans>Retry connection</Trans>
        </button>
      ) : null}
      {kind !== "page" && !sdkProblem ? (
        <button type="button" disabled={c.busy} onClick={() => void c.connect()}>
          <Trans>Review access</Trans>
        </button>
      ) : null}
    </div>
  );
}

function problemTitle(
  c: ExtensionCaptureController,
  kind: NonNullable<ExtensionCaptureController["problemKind"]>,
): string {
  if (c.source) {
    return kind === "page"
      ? t`Saved. This page could not be updated.`
      : t`Source saved. This action did not finish.`;
  }
  if (c.saveAttempted) {
    return t`Save not confirmed`;
  }
  return kind === "page" ? t`Reader cannot read this page` : t`Not connected`;
}
