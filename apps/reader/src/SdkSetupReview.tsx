import { ConnectLayout } from "@mdbase-dev/ui/screens";
import {
  describeError,
  isMdbaseError,
  type MdbaseApplication,
  type MdbaseSetupPlan,
} from "@mdbase-reader/connect/native";
import { useCallback, useEffect, useRef, useState, type JSX } from "react";

type State =
  | { readonly kind: "planning"; readonly note: string | null }
  | { readonly kind: "review"; readonly plan: MdbaseSetupPlan; readonly note: string | null }
  | { readonly kind: "applying"; readonly plan: MdbaseSetupPlan }
  | { readonly kind: "failed"; readonly message: string };

type Setup = Pick<MdbaseApplication, "setup" | "configure">;

const changedNote =
  "This collection changed while you were reviewing. Nothing was changed. Here are the updated changes.";
const unknownNote =
  "Reader couldn't confirm whether setup finished. Here is the collection as it is now.";

/** Only a known refusal proves nothing was written. A lost reply after the
 * request was sent, or an error that isn't an SDK error, may have applied. */
function setupOutcome(error: unknown): "changed" | "unknown" | "failed" {
  if (!isMdbaseError(error)) {
    return "unknown";
  }
  if (error.reason === "setup_changed") {
    return "changed";
  }
  return error.code === "outcome_unknown" || error.mutationId !== undefined ? "unknown" : "failed";
}

/** Nothing to review: no changes, no conflicts and no refusal. */
function quiet(plan: MdbaseSetupPlan): boolean {
  return !plan.refusal && plan.changes.length === 0 && plan.conflicts.length === 0;
}

function describe(error: unknown, fallback: string): string {
  return describeError(error)?.message ?? fallback;
}

/** Read through a call: the abort state changes across the awaited action. */
function stopped(signal: AbortSignal): boolean {
  return signal.aborted;
}

/** Plan on mount, plan again on request, and apply exactly the reviewed plan. */
function useSetupReview(
  application: Setup,
  onApplied: (() => void) | undefined,
): {
  readonly state: State;
  readonly plan: (note?: string) => Promise<void>;
  readonly confirm: (reviewed: MdbaseSetupPlan) => Promise<void>;
  readonly chooseAppVersion: (reviewed: MdbaseSetupPlan) => void;
} {
  const [state, setState] = useState<State>({ kind: "planning", note: null });
  const adopt = useRef<Readonly<Record<string, string>> | undefined>(undefined);
  const scope = useRef<AbortController | null>(null);
  const applied = useRef(onApplied);
  useEffect(() => {
    applied.current = onApplied;
  });

  const plan = useCallback(
    async (note?: string): Promise<void> => {
      const signal = scope.current?.signal;
      if (!signal || signal.aborted) {
        return;
      }
      setState({ kind: "planning", note: note ?? null });
      try {
        const options = adopt.current ? { signal, adopt: adopt.current } : { signal };
        const next = await application.setup.plan(options);
        if (stopped(signal)) {
          return;
        }
        // Nothing to review keeps the plain configure() path, unless this is a
        // re-assessment after an unconfirmed outcome that must be shown.
        if (quiet(next) && note === undefined) {
          await application.configure({ signal });
          if (!stopped(signal)) {
            applied.current?.();
          }
          return;
        }
        setState({ kind: "review", plan: next, note: note ?? null });
      } catch (error) {
        if (!stopped(signal)) {
          setState({
            kind: "failed",
            message: describe(error, "Reader couldn't check what setup would change."),
          });
        }
      }
    },
    [application],
  );

  useEffect(() => {
    const controller = new AbortController();
    scope.current = controller;
    // StrictMode replays effects; only the surviving scope plans.
    queueMicrotask(() => {
      if (!controller.signal.aborted) {
        void plan();
      }
    });
    return () => controller.abort();
  }, [plan]);

  const confirm = async (reviewed: MdbaseSetupPlan): Promise<void> => {
    const signal = scope.current?.signal;
    if (!signal || signal.aborted) {
      return;
    }
    setState({ kind: "applying", plan: reviewed });
    try {
      await application.setup.apply(reviewed, { signal });
      if (!stopped(signal)) {
        applied.current?.();
      }
    } catch (error) {
      if (stopped(signal)) {
        return;
      }
      const outcome = setupOutcome(error);
      if (outcome !== "failed") {
        await plan(outcome === "changed" ? changedNote : unknownNote);
        return;
      }
      setState({
        kind: "failed",
        message: describe(error, "Setup couldn't be completed. Please try again."),
      });
    }
  };
  const chooseAppVersion = (reviewed: MdbaseSetupPlan): void => {
    adopt.current = reviewed.adoptable;
    void plan();
  };
  return { state, plan, confirm, chooseAppVersion };
}

function statusText(state: State): string | null {
  switch (state.kind) {
    case "planning":
      return state.note ?? "Checking what setup would change…";
    case "review":
      return state.note;
    case "applying":
      return "Setting up…";
    default:
      return null;
  }
}

function ReviewButton({
  label,
  primary,
  disabled,
  onClick,
}: {
  readonly label: string;
  readonly primary?: boolean;
  readonly disabled: boolean;
  readonly onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className={`mdbase-connect-action mdbase-button${primary === true ? " is-primary" : ""}`}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function ChangeList({ plan }: { readonly plan: MdbaseSetupPlan }): JSX.Element | null {
  if (plan.changes.length === 0 && plan.conflicts.length === 0) {
    return null;
  }
  return (
    <ul className="reader-setup-changes">
      {plan.changes.map((change) => (
        <li key={`${change.kind}:${change.target}`}>{change.message}</li>
      ))}
      {plan.conflicts.map((conflict) => (
        <li key={`conflict:${conflict.target}`} className="is-conflict">
          {conflict.message}
        </li>
      ))}
    </ul>
  );
}

/** The one forward action: Confirm, use the app's version, or try again. */
function PrimaryAction({
  review,
}: {
  readonly review: ReturnType<typeof useSetupReview>;
}): JSX.Element {
  const { state } = review;
  if (state.kind === "failed") {
    return (
      <ReviewButton label="Try again" primary disabled={false} onClick={() => void review.plan()} />
    );
  }
  const shown = state.kind === "planning" ? null : state.plan;
  const busy = state.kind !== "review";
  const adoptable =
    shown?.refusal?.code === "setup_conflict" &&
    shown.conflicts.length > 0 &&
    shown.conflicts.every((conflict) => conflict.adoptable);
  if (adoptable) {
    return (
      <ReviewButton
        label="Use Reader's version"
        primary
        disabled={busy}
        onClick={() => review.chooseAppVersion(shown)}
      />
    );
  }
  return (
    <ReviewButton
      label={shown?.status === "current" ? "Continue" : "Confirm"}
      primary
      disabled={busy || !shown || (!shown.canApply && shown.status !== "current")}
      onClick={() => {
        if (shown) {
          void review.confirm(shown);
        }
      }}
    />
  );
}

/**
 * One review before setup: the SDK plan's summary and plain per-change messages.
 * Nothing is written until Confirm, which applies exactly the reviewed plan. A
 * collection that changed during the review is planned again for a fresh review.
 */
export function SdkSetupReview({
  application,
  displayName,
  embedded,
  onCancel,
  onApplied,
}: {
  readonly application: Setup;
  readonly displayName: string;
  readonly embedded: boolean;
  readonly onCancel: () => void;
  readonly onApplied?: () => void;
}): JSX.Element {
  const review = useSetupReview(application, onApplied);
  const { state } = review;
  const shown = state.kind === "review" || state.kind === "applying" ? state.plan : null;
  const status = statusText(state);
  const error = state.kind === "failed" ? state.message : null;
  const body = (
    <>
      {shown ? <p className="reader-setup-summary">{shown.summary}</p> : null}
      {shown?.refusal ? (
        <p className="reader-setup-refusal" role="alert">
          {shown.refusal.message}
        </p>
      ) : null}
      {shown ? <ChangeList plan={shown} /> : null}
      <div className="connection-actions">
        <PrimaryAction review={review} />
        <ReviewButton label="Cancel" disabled={state.kind === "applying"} onClick={onCancel} />
      </div>
    </>
  );
  if (embedded) {
    return (
      <section className="import-step" aria-labelledby="reader-setup-title">
        <h2 id="reader-setup-title">Set up {displayName}</h2>
        {error ? <p role="alert">{error}</p> : null}
        {!error && status ? <p role="status">{status}</p> : null}
        {body}
      </section>
    );
  }
  return (
    <ConnectLayout app="reader" title={`Set up ${displayName}`} error={error} status={status}>
      {body}
    </ConnectLayout>
  );
}
