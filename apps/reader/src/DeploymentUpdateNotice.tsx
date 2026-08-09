import type { JSX } from "react";

export function DeploymentUpdateNotice(): JSX.Element {
  return (
    <div className="deployment-update" role="status">
      <span>A newer Reader is ready.</span>
      <button type="button" onClick={() => window.location.reload()}>
        Reload Reader
      </button>
    </div>
  );
}
