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
    return (
      <FeatureBoundary key={attempt} label={label} retry={retry}>
        <Suspense fallback={<p role="status">{translate`Loading ${label}…`}</p>}>
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
  { readonly label: string; readonly retry: () => void; readonly children: ReactNode },
  { readonly failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError(): { readonly failed: boolean } {
    return { failed: true };
  }

  override render(): ReactNode {
    return this.state.failed ? (
      <div className="lazy-feature-error" role="alert">
        <p>{translate`Reader could not load ${this.props.label}.`}</p>
        <button type="button" onClick={this.props.retry}>
          <Trans context="Reader interface">Try again</Trans>
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
