import { useLingui } from "@lingui/react/macro";
import { FeedbackButton, useFeedback } from "@mdbase-dev/ui/feedback";
import { useEffect, type JSX, type ReactNode } from "react";

export type RendererState =
  { readonly status: "opening" | "ready" } | { readonly status: "error"; readonly message: string };

export function RendererStage({
  state,
  openingLabel,
  errorName,
  onRetry,
  children,
}: {
  readonly state: RendererState;
  readonly openingLabel: string;
  readonly errorName: string;
  readonly onRetry?: () => void;
  readonly children: ReactNode;
}): JSX.Element {
  const { t } = useLingui();
  const { reportError } = useFeedback();
  useEffect(() => {
    if (state.status === "error") {
      reportError({ code: "preview_failed" });
    }
  }, [state.status, reportError]);
  return (
    <div className="document-renderer-stage">
      {state.status === "error" ? null : children}
      {state.status === "opening" ? (
        <div className="document-renderer-status">
          <DocumentMessage label={openingLabel} />
        </div>
      ) : null}
      {state.status === "error" ? (
        <div className="document-renderer-status">
          <DocumentMessage
            label={
              !navigator.onLine
                ? t`You’re offline. This file isn’t downloaded yet. Connect to the internet and try again.`
                : t`${errorName} could not open this file. Check your connection and try again.`
            }
            tone="error"
            {...(onRetry
              ? {
                  action: {
                    label: t({ message: "Try again", context: "Reader interface" }),
                    run: onRetry,
                  },
                }
              : {})}
          />
        </div>
      ) : null}
    </div>
  );
}

export function DocumentMessage({
  label,
  tone = "neutral",
  action,
}: {
  readonly label: string;
  readonly tone?: "neutral" | "error";
  readonly action?: { readonly label: string; readonly run: () => void };
}): JSX.Element {
  return (
    <div
      className={`connected-document-message is-${tone}`}
      role={tone === "error" ? "alert" : "status"}
    >
      <span>{label}</span>
      {tone === "error" ? <FeedbackButton topic="problem" /> : null}
      {action ? (
        <button type="button" onClick={action.run}>
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
