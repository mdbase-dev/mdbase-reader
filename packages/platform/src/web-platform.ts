import { pickBrowserFile } from "./browser-file-picker.js";

import type { KeyValueStorage, ReaderPlatform } from "./platform.js";

class BrowserStorage implements KeyValueStorage {
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
