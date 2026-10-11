import { ConnectLayout } from "@mdbase-dev/ui/screens";
import {
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

type Setup = Pick<MdbaseApplication, "setup">;

const changedNote =
  "This collection changed while you were reviewing. Here are the updated changes.";

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
        if (!stopped(signal)) {
          setState({ kind: "review", plan: next, note: note ?? null });
        }
      } catch {
        if (!stopped(signal)) {
          setState({ kind: "failed", message: "Reader couldn't check what setup would change." });
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
        onApplied?.();
      }
    } catch (error) {
      if (stopped(signal)) {
        return;
      }
      if (isMdbaseError(error) && error.reason === "setup_changed") {
        await plan(changedNote);
        return;
      }
      setState({ kind: "failed", message: "Setup didn't finish. Nothing was changed." });
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
