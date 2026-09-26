import { readerDiagnostics } from "@mdbase-reader/connect";
import { useEffect, useState } from "react";

import { environment } from "./environment.js";

export function DiagnosticsPanel(): React.JSX.Element {
  const [enabled, setEnabled] = useState(readerDiagnostics.enabled);
  useEffect(() => () => readerDiagnostics.setEnabled(false), []);
  const toggle = (): void => {
    const next = !enabled;
    readerDiagnostics.setEnabled(next, [environment.connectUrl, environment.loopbackUrl]);
    setEnabled(next);
  };
  const download = (): void => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(readerDiagnostics.report(), null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "reader-connection-timings.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };
  return (
    <details>
      <summary>Connection diagnostics</summary>
      <p>
        Record timings in this panel only. No page text, paths, queries, IDs or credentials are
        recorded. Nothing is uploaded. Stopping or closing clears the recording.
      </p>
      <button type="button" className="text-button" onClick={toggle}>
        {enabled ? "Stop and clear timings" : "Record connection timings"}
      </button>
      {enabled ? (
        <button type="button" className="text-button" onClick={download}>
          Download timings
        </button>
      ) : null}
    </details>
  );
}
