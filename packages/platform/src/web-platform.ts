import type { KeyValueStorage, PickedFile, ReaderPlatform } from "./platform.js";

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

async function pickBrowserFile(accept: readonly string[]): Promise<PickedFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept.join(",");
    input.addEventListener(
      "change",
      () => {
        const file = input.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }
        void file
          .arrayBuffer()
          .then((bytes) =>
            resolve({ name: file.name, mediaType: file.type, size: file.size, bytes }),
          );
      },
      { once: true },
    );
    input.click();
  });
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
      link.click();
      URL.revokeObjectURL(url);
      return Promise.resolve();
    },
    openExternal(url) {
      window.open(url, "_blank", "noopener,noreferrer");
      return Promise.resolve();
    },
  };
}
