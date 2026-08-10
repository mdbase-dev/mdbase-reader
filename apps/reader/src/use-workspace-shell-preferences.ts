import { useCallback, useEffect, useState } from "react";

import { defaultShellPreferences, parseShellPreferences } from "./workspace-shell-preferences.js";

import type { WorkspaceShellPreferences } from "./workspace-shell-preferences.js";

const prefix = "mdbase-reader:shell:v1:";

export interface WorkspaceShellPreferencesController {
  readonly value: WorkspaceShellPreferences;
  readonly update: (patch: Partial<WorkspaceShellPreferences>) => void;
}

export function useWorkspaceShellPreferences(
  collectionKey: string,
): WorkspaceShellPreferencesController {
  const [value, setValue] = useState(() => restore(collectionKey));
  useEffect(() => {
    try {
      globalThis.localStorage.setItem(`${prefix}${collectionKey}`, JSON.stringify(value));
    } catch {
      // Device-local preferences are optional in constrained webviews.
    }
  }, [collectionKey, value]);
  const update = useCallback((patch: Partial<WorkspaceShellPreferences>): void => {
    setValue((current) => parseShellPreferences({ ...current, ...patch }));
  }, []);
  return { value, update };
}

function restore(collectionKey: string): WorkspaceShellPreferences {
  try {
    const serialized = globalThis.localStorage.getItem(`${prefix}${collectionKey}`);
    return serialized
      ? parseShellPreferences(JSON.parse(serialized) as unknown)
      : defaultShellPreferences();
  } catch {
    return defaultShellPreferences();
  }
}
