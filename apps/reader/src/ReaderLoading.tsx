import { ReaderButton } from "@mdbase-reader/ui";

import type { JSX } from "react";

export function ReaderLoading({
  error,
  onRetry,
}: {
  readonly error: string | null;
  readonly onRetry: () => void;
}): JSX.Element {
  if (!error) {
    return (
      <div className="reader-loading" role="status">
        Opening your reading collection…
      </div>
    );
  }
  return (
    <div className="reader-loading is-error" role="alert">
      <p>{error}</p>
      <ReaderButton onClick={onRetry}>Try again</ReaderButton>
    </div>
  );
}
