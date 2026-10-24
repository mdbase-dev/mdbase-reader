import { FeedbackButton } from "@mdbase-dev/ui/feedback";
import { ConnectLayout } from "@mdbase-dev/ui/screens";
import { Component } from "react";

import type { ReactNode } from "react";

/**
 * The last resort for a rendering failure anywhere in Reader: a plain message and a reload,
 * rather than a blank page. Features that can recover alone keep their own boundaries.
 */
export class ReaderErrorBoundary extends Component<
  { readonly children: ReactNode; readonly reload?: () => void },
  { readonly failed: boolean; readonly error: unknown }
> {
  override state: { readonly failed: boolean; readonly error: unknown } = {
    failed: false,
    error: null,
  };

  static getDerivedStateFromError(error: unknown): {
    readonly failed: boolean;
    readonly error: unknown;
  } {
    return { failed: true, error };
  }

  override render(): ReactNode {
    const { failed, error } = this.state;
    if (!failed) {
      return this.props.children;
    }
    const reload = this.props.reload ?? (() => location.reload());
    return (
      <ConnectLayout
        app="reader"
        title="Reader hit a problem and stopped"
        error="Reload to keep reading. If it happens again, send feedback so it can be fixed."
        detail={errorDetail(error)}
      >
        <div className="connection-actions">
          <button type="button" className="mdbase-button" onClick={reload}>
            Reload
          </button>
        </div>
        <FeedbackButton />
      </ConnectLayout>
    );
  }
}

function errorDetail(error: unknown): string {
  if (error instanceof Error) {
    return error.message ? `${error.name}: ${error.message}` : error.name;
  }
  return String(error);
}
