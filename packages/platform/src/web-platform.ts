import { pickBrowserFile } from "./browser-file-picker.js";

import type { ListableStorage, ReaderPlatform } from "./platform.js";

/** `localStorage`, shared by every tab of this origin. */
export class BrowserStorage implements ListableStorage {
  get(key: string): Promise<string | null> {
    return Promise.resolve(localStorage.getItem(key));
  }

  set(key: string, value: string): Promise<void> {
    localStorage.setItem(key, value);
    return Promise.resolve();
  }

  remove(key: string): Promise<void> {
    localStorage.removeItem(key);
    return Promise.resolve();
  }

  keys(prefix: string): Promise<readonly string[]> {
    const keys: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(prefix)) {
        keys.push(key);
      }
    }
    return Promise.resolve(keys);
  }
}

export function createWebPlatform(): ReaderPlatform {
  return {
    kind: "web",
    storage: new BrowserStorage(),
    pickFile: pickBrowserFile,
    saveFile(name, blob) {
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.href = url;
      link.download = name;
      link.hidden = true;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      return Promise.resolve();
    },
    openExternal(url) {
      window.open(url, "_blank", "noopener,noreferrer");
      return Promise.resolve();
    },
  };
}
