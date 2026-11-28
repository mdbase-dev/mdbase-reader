import { t as translate } from "@lingui/core/macro";
import { useLingui as useLocale } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { Component, useEffect, useState } from "react";

import type { ComponentType, JSX, ReactNode } from "react";

/** Share intent preloads with mounting; failed downloads can be retried without a reload. */
export function lazyFeature<Props extends object>(
  importFeature: () => Promise<{ default: ComponentType<Props> }>,
  label: string,
  renderLoading?: (props: Props) => ReactNode,
): ComponentType<Props> & { preload: () => void } {
  type Module = Awaited<ReturnType<typeof importFeature>>;
  type LoadResult = Module | { readonly error: unknown };
  let loaded: Module | undefined;
  let pending: Promise<Module> | undefined;
  const load = (): Promise<Module> => {
    pending ??= importFeature().then(
      (module) => {
        loaded = module;
        return module;
      },
      (error: unknown) => {
        pending = undefined;
        throw error;
      },
    );
    return pending;
  };

  function FeatureContent({ props }: { readonly props: Props }): JSX.Element {
    // Commit as soon as the import settles. A Suspense fallback can delay that commit
    // even after an intent preload has finished loading the renderer.
    const [result, setResult] = useState<LoadResult | undefined>(() => loaded);
    useEffect(() => {
      let active = true;
      void load().then(
        (module) => {
          if (active) {
            setResult(module);
          }
        },
        (error: unknown) => {
          if (active) {
            setResult({ error });
          }
        },
      );
      return () => {
        active = false;
      };
    }, []);
    if (result && "error" in result) {
      throw result.error;
    }
    if (result) {
      const Surface = result.default;
      return <Surface {...props} />;
    }
    return (
      <>
        {renderLoading ? (
          renderLoading(props)
        ) : (
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
        )}
      </>
    );
  }

  function Feature(props: Props): JSX.Element {
    useLocale();
    const [attempt, setAttempt] = useState(0);
    const retry = (): void => {
      setAttempt((current) => current + 1);
    };
    const onError =
      "onDocumentError" in props && typeof props.onDocumentError === "function"
        ? (props.onDocumentError as (message: string) => void)
        : undefined;
    return (
      <FeatureBoundary key={attempt} label={label} retry={retry} onError={onError}>
        <FeatureContent props={props} />
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
