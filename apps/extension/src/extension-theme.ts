import {
  applyThemePreference,
  loadThemePreference,
  normalizeThemePreference,
  saveThemePreference,
  THEME_STORAGE_KEY,
  type ThemePreference,
  type ThemeRoot,
  type ThemeStorage,
} from "@mdbase-dev/ui/theme";
import { useEffect, useState } from "react";

/**
 * The extension's own System / Light / Dark choice. Extension pages share one origin, so
 * the preference lives in their `localStorage`: it can be read before the first render
 * (no flash of the other theme), and the `storage` event tells every other open page
 * (such as the side panel while Settings changes it). Reader, on its own origin, keeps
 * a separate choice.
 */
export function startTheme(
  storage: ThemeStorage,
  root: ThemeRoot,
  events: Pick<Window, "addEventListener" | "removeEventListener">,
): () => void {
  applyThemePreference(loadThemePreference(storage), root);
  const onStorage = (event: StorageEvent): void => {
    if (event.key === THEME_STORAGE_KEY) {
      applyThemePreference(normalizeThemePreference(event.newValue), root);
    }
  };
  events.addEventListener("storage", onStorage);
  return () => events.removeEventListener("storage", onStorage);
}

export function useThemePreference(): readonly [ThemePreference, (next: ThemePreference) => void] {
  // `globalThis.localStorage` is absent when rendered outside a page (tests); that reads as System.
  const [theme, setTheme] = useState<ThemePreference>(() =>
    loadThemePreference(globalThis.localStorage),
  );
  useEffect(() => {
    // Another Settings tab may change it too.
    const onStorage = (event: StorageEvent): void => {
      if (event.key === THEME_STORAGE_KEY) {
        setTheme(normalizeThemePreference(event.newValue));
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  const change = (next: ThemePreference): void => {
    setTheme(next);
    saveThemePreference(next, localStorage, document.documentElement);
  };
  return [theme, change];
}
