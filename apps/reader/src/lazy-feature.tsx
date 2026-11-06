import { t as translate } from "@lingui/core/macro";
import { useLingui as useLocale } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { Component, lazy, Suspense, useState } from "react";

import type { ComponentType, JSX, ReactNode } from "react";

/** Share intent preloads with mounting; failed downloads can be retried without a reload. */
export function lazyFeature<Props extends object>(
  importFeature: () => Promise<{ default: ComponentType<Props> }>,
  label: string,
): ComponentType<Props> & { preload: () => void } {
  let pending: ReturnType<typeof importFeature> | undefined;
  const load = (): ReturnType<typeof importFeature> => {
    pending ??= importFeature().catch((error: unknown) => {
      pending = undefined;
      throw error;
    });
    return pending;
  };
  function Feature(props: Props): JSX.Element {
    useLocale();
    // React.lazy remembers rejections; a retry needs a fresh lazy identity.
    const [{ attempt, Surface }, setFeature] = useState(() => ({
      attempt: 0,
      Surface: lazy(load),
    }));
    const retry = (): void => {
      setFeature((current) => ({ attempt: current.attempt + 1, Surface: lazy(load) }));
    };
    const onError =
      "onDocumentError" in props && typeof props.onDocumentError === "function"
        ? (props.onDocumentError as (message: string) => void)
        : undefined;
    return (
      <FeatureBoundary key={attempt} label={label} retry={retry} onError={onError}>
        <Suspense
          fallback={
            <div
              className="reader-feature-skeleton"
              role="status"
              aria-label={translate`Loading ${label}…`}
            >
              <span />
              <span />
              <span />
              <span />
            </div>
          }
        >
          <Surface {...props} />
        </Suspense>
      </FeatureBoundary>
    );
  }
  return Object.assign(Feature, {
    preload: () => {
      // A speculative preload must not produce an unhandled rejection.
      void load().catch(() => undefined);
    },
  });
}

class FeatureBoundary extends Component<
  {
    readonly label: string;
    readonly retry: () => void;
    readonly children: ReactNode;
    readonly onError: ((message: string) => void) | undefined;
  },
  { readonly failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError(): { readonly failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(): void {
    this.props.onError?.(
      translate`This reading tool could not be loaded. Connect to the internet and try again.`,
    );
  }

  override render(): ReactNode {
    if (this.state.failed && this.props.onError) {
      return null;
    }
    return this.state.failed ? (
      <div className="connected-document-message is-error" role="alert">
        <h2>{translate`Reading tool unavailable`}</h2>
        <p>{translate`Connect to the internet and try again to load this reading tool.`}</p>
        <button type="button" onClick={this.props.retry}>
          <Trans context="Reader interface">Try again</Trans>
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
