import { useEffect, useState } from "react";

import { pageStatusEnabled, setPageStatusEnabled } from "./page-status.js";

export function PageStatusSetting(): React.JSX.Element {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    pageStatusEnabled()
      .then(setEnabled)
      .catch(() => setEnabled(false));
  }, []);
  return (
    <details className="settings">
      <summary>Settings</summary>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={enabled === true}
          disabled={enabled === null}
          onChange={(event) => {
            setPageStatusEnabled(event.target.checked)
              .then(setEnabled)
              .catch(() => undefined);
          }}
        />
        Mark pages I’ve saved and show my highlights on them
      </label>
      <p className="hint">
        Asks Chrome for access to HTTPS pages. Reader then looks up each page’s address in your
        selected collection; it reads page text only to draw your highlights. Turning this off gives
        the access back.
      </p>
    </details>
  );
}
