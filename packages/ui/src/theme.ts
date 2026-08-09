export const themeStorageKey = "mdbase:theme";
export const themePreferences = ["system", "light", "dark"] as const;
export type ThemePreference = (typeof themePreferences)[number];

export interface ThemeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ThemeRoot {
  readonly dataset: DOMStringMap;
  removeAttribute(name: string): void;
}

export function normalizeThemePreference(value: unknown): ThemePreference {
  return themePreferences.includes(value as ThemePreference)
    ? (value as ThemePreference)
    : "system";
}

export function loadThemePreference(storage: ThemeStorage): ThemePreference {
  try {
    return normalizeThemePreference(storage.getItem(themeStorageKey));
  } catch {
    return "system";
  }
}

export function applyThemePreference(preference: ThemePreference, root: ThemeRoot): void {
  if (preference === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.dataset["theme"] = preference;
  }
}

export function saveThemePreference(
  preference: ThemePreference,
  storage: ThemeStorage,
  root: ThemeRoot,
): void {
  try {
    storage.setItem(themeStorageKey, preference);
  } catch {
    // Applying the in-memory preference remains useful when storage is unavailable.
  }
  applyThemePreference(preference, root);
}
