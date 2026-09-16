import { ProductBrand, ReaderButton } from "@mdbase-reader/ui";

import type { JSX, ReactNode } from "react";

export function ConnectionRetry({
  error,
  onRetry,
}: {
  readonly error: string | null;
  readonly onRetry: () => void;
}): JSX.Element | null {
  return error ? <ReaderButton onClick={onRetry}>Try again</ReaderButton> : null;
}

export function ConnectionLayout({
  status,
  error,
  children,
}: {
  readonly status: string;
  readonly error?: string | null;
  readonly children?: ReactNode;
}): JSX.Element {
  return (
    <main className="connection-screen">
      <section className="connection-card">
        <ProductBrand />
        <div className="connection-copy">
          <h1>Open mdbase Reader</h1>
          <p role="status">{status}</p>
          {error ? (
            <p className="connection-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        {children}
      </section>
    </main>
  );
}
