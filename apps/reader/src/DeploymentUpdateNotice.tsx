import { Trans } from "@lingui/react/macro";

import type { JSX } from "react";

export function DeploymentUpdateNotice(): JSX.Element {
  return (
    <div className="deployment-update" role="status">
      <span>
        <Trans>A newer Reader is ready.</Trans>
      </span>
      <button type="button" onClick={() => window.location.reload()}>
        <Trans>Reload Reader</Trans>
      </button>
    </div>
  );
}
