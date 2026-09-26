import { useEffect, useState } from "react";

/**
 * Whether the side panel offers connection diagnostics. Recording has to happen in the
 * panel itself (timings are kept in its memory), so Settings only decides whether the
 * control appears there.
 */
const settingKey = "show-diagnostics";

export function useDiagnosticsShown(): readonly [boolean, (shown: boolean) => void] {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    let active = true;
    chrome.storage.local
      .get(settingKey)
      .then(({ [settingKey]: value }) => {
        if (active) {
          setShown(value === true);
        }
      })
      .catch(() => undefined);
    const onChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ): void => {
      const change = changes[settingKey];
      if (area === "local" && change) {
        setShown(change.newValue === true);
      }
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => {
      active = false;
      chrome.storage.onChanged.removeListener(onChanged);
    };
  }, []);
  const update = (next: boolean): void => {
    setShown(next);
    void chrome.storage.local.set({ [settingKey]: next }).catch(() => undefined);
  };
  return [shown, update];
}
