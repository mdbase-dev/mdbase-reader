import { useEffect, useState } from "react";

const CURRENT_REVISION = import.meta.env.VITE_MDBASE_READER_BUILD_ID ?? "local";
const UPDATE_POLL_INTERVAL_MS = 60_000;

interface DeploymentRevisionDocument {
  readonly revision: string;
}

export function useDeploymentUpdate(): boolean {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    if (CURRENT_REVISION === "local" || available) {
      return undefined;
    }
    let disposed = false;
    const check = (): void => {
      void fetchDeploymentRevision().then((deployed) => {
        if (
          !disposed &&
          deployed &&
          deploymentUpdateAvailable(CURRENT_REVISION, deployed.revision)
        ) {
          setAvailable(true);
        }
      });
    };
    const initial = window.setTimeout(check, 0);
    const poll = window.setInterval(check, UPDATE_POLL_INTERVAL_MS);
    const checkWhenVisible = (): void => {
      if (document.visibilityState === "visible") {
        check();
      }
    };
    const checkOnFocus = (): void => check();
    window.addEventListener("focus", checkOnFocus);
    document.addEventListener("visibilitychange", checkWhenVisible);
    return () => {
      disposed = true;
      window.clearTimeout(initial);
      window.clearInterval(poll);
      window.removeEventListener("focus", checkOnFocus);
      document.removeEventListener("visibilitychange", checkWhenVisible);
    };
  }, [available]);

  return available;
}

async function fetchDeploymentRevision(): Promise<DeploymentRevisionDocument | null> {
  try {
    const response = await fetch(
      new URL("/.well-known/mdbase-reader-build.json", window.location.origin),
      { cache: "no-store", credentials: "same-origin" },
    );
    return response.ok ? parseDeploymentRevision(await response.json()) : null;
  } catch {
    // Update discovery is advisory and must never interrupt reading or editing.
    return null;
  }
}

export function parseDeploymentRevision(value: unknown): DeploymentRevisionDocument | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const revision = (value as { readonly revision?: unknown }).revision;
  return typeof revision === "string" && /^[a-zA-Z0-9_-]{7,64}$/u.test(revision)
    ? { revision }
    : null;
}

export function deploymentUpdateAvailable(current: string, deployed: string): boolean {
  return current !== "local" && current !== deployed;
}
