import { Trans, useLingui } from "@lingui/react/macro";
import { useState, type JSX } from "react";

import type { ReadiumRuntime } from "./readium-runtime.js";

export function EpubPageNavigation({
  runtime,
}: {
  readonly runtime: ReadiumRuntime | null;
}): JSX.Element {
  const { t } = useLingui();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const move = async (direction: -1 | 1): Promise<void> => {
    if (!runtime?.goPage || busy) {
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      if (!(await runtime.goPage(direction))) {
        setMessage(direction === 1 ? t`End of publication` : t`Start of publication`);
      }
    } catch {
      setMessage(t`Could not turn the page. Try again.`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <nav className="epub-page-navigation" aria-label={t`EPUB page navigation`}>
      <button type="button" disabled={!runtime?.goPage || busy} onClick={() => void move(-1)}>
        <Trans>Previous page</Trans>
      </button>
      <button type="button" disabled={!runtime?.goPage || busy} onClick={() => void move(1)}>
        <Trans>Next page</Trans>
      </button>
      <span role="status">{message}</span>
    </nav>
  );
}
