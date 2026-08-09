import type { JSX, ReactNode } from "react";

export type RendererState =
  { readonly status: "opening" | "ready" } | { readonly status: "error"; readonly message: string };

export function RendererStage({
  state,
  openingLabel,
  errorName,
  children,
}: {
  readonly state: RendererState;
  readonly openingLabel: string;
  readonly errorName: string;
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <div className="document-renderer-stage">
      {children}
      {state.status === "opening" ? (
        <div className="document-renderer-status">
          <DocumentMessage label={openingLabel} />
        </div>
      ) : null}
      {state.status === "error" ? (
        <div className="document-renderer-status">
          <DocumentMessage
            label={`${errorName} could not render this file: ${state.message}`}
            tone="error"
          />
        </div>
      ) : null}
    </div>
  );
}

export function DocumentMessage({
  label,
  tone = "neutral",
}: {
  readonly label: string;
  readonly tone?: "neutral" | "error";
}): JSX.Element {
  return (
    <div
      className={`connected-document-message is-${tone}`}
      role={tone === "error" ? "alert" : "status"}
    >
      {label}
    </div>
  );
}
