import { useEffect, useState } from "react";

/** Explicit consent to send a captured page's address to Wikimedia. Missing values are OFF. */
const settingKey = "citoid-enabled";

export async function citoidEnabled(): Promise<boolean> {
  try {
    const values = await chrome.storage.local.get(settingKey);
    return values[settingKey] === true;
  } catch {
    return false;
  }
}

export function useCitoidEnabled(): readonly [boolean, (enabled: boolean) => void] {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let active = true;
    let changed = false;
    void citoidEnabled().then((value) => {
      if (active && !changed) {
        setEnabled(value);
      }
    });
    const onChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ): void => {
      const change = changes[settingKey];
      if (area === "local" && change) {
        changed = true;
        setEnabled(change.newValue === true);
      }
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => {
      active = false;
      chrome.storage.onChanged.removeListener(onChanged);
    };
  }, []);
  const update = (next: boolean): void => {
    setEnabled(next);
    void chrome.storage.local.set({ [settingKey]: next }).catch(() => setEnabled(enabled));
  };
  return [enabled, update];
}
