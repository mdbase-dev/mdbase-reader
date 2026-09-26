import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { environment } from "./environment.js";

import type { ReaderDirectAccessController } from "@mdbase-reader/connect";

export function localConnectorPermission(): { origins: string[] } {
  const url = new URL(environment.loopbackUrl);
  return { origins: [`${url.protocol}//${url.hostname}/*`] };
}

/** Host access and Chrome's local-network permission are separate, explicit approvals. */
export function DirectAccessPanel({
  controller,
  busy,
  onUnavailable,
}: {
  readonly controller: ReaderDirectAccessController;
  readonly busy: boolean;
  readonly onUnavailable: () => Promise<void>;
}): React.JSX.Element | null {
  const subscribe = useCallback(
    (listener: () => void) => controller.subscribe(listener),
    [controller],
  );
  const snapshot = useSyncExternalStore(subscribe, controller.getSnapshot, controller.getSnapshot);
  const [granted, setGranted] = useState(false);
  const [working, setWorking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    if (controller.getSnapshot()?.authority !== "connector") {
      return;
    }
    let active = true;
    void chrome.permissions
      .contains(localConnectorPermission())
      .then((allowed) => {
        if (active) {
          setGranted(allowed);
        }
        if (active && allowed) {
          void controller.check().catch(() => undefined);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [controller]);

  if (snapshot?.authority !== "connector") {
    return null;
  }
  const request = (): void => {
    setWorking(true);
    setProblem(null);
    // Call the relevant permission API synchronously in the user gesture.
    const operation = granted
      ? controller.request().then(async (outcome) => {
          if (!outcome.ok || outcome.value !== "available") {
            controller.disable();
            await onUnavailable();
            setProblem(
              "Local access is not available. Check Chrome's local-network permission and that mdbase Connect is running. The relay is still available.",
            );
          }
        })
      : chrome.permissions.request(localConnectorPermission()).then((allowed) => {
          setGranted(allowed);
          setProblem(
            allowed
              ? "Connector permission allowed. Click Connect directly to finish local-network approval."
              : "Local access was not granted. You can continue using the relay.",
          );
        });
    void operation
      .catch(async () => {
        controller.disable();
        await onUnavailable();
        setProblem("Could not connect locally. You can continue using the relay.");
      })
      .finally(() => setWorking(false));
  };
  return (
    <div className="direct-access">
      <p>
        {snapshot.status === "available"
          ? "Direct local connection available."
          : snapshot.status === "disabled"
            ? "Using the cloud relay. Direct access could not be enabled; check connector compatibility and browser permissions before retrying."
            : "Using the cloud relay. Connect directly for faster access on this computer."}
      </p>
      {snapshot.status !== "available" ? (
        <button type="button" disabled={busy || working} onClick={request}>
          {working
            ? "Connecting locally…"
            : granted
              ? "Connect directly"
              : "Allow local connector access"}
        </button>
      ) : null}
      {problem ? <p role="status">{problem}</p> : null}
    </div>
  );
}
