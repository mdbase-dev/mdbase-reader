import { useEffect, useRef, type JSX } from "react";

export function SearchPassageStatus({ message }: { readonly message: string }): JSX.Element | null {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (message) {
      ref.current?.focus();
    }
  }, [message]);
  return message ? (
    <p className="search-passage-status" role="status" tabIndex={-1} ref={ref}>
      {message}
    </p>
  ) : null;
}
