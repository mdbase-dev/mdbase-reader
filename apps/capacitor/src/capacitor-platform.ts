import { Browser } from "@capacitor/browser";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Preferences } from "@capacitor/preferences";
import { pickBrowserFile } from "@mdbase-reader/platform";

import type { KeyValueStorage, ReaderPlatform } from "@mdbase-reader/platform";

const storage: KeyValueStorage = {
  get: async (key) => (await Preferences.get({ key })).value,
  set: async (key, value) => Preferences.set({ key, value }),
  remove: async (key) => Preferences.remove({ key }),
};

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Could not read export data."));
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("The export could not be encoded."));
        return;
      }
      resolve(reader.result.split(",")[1] ?? "");
    };
    reader.readAsDataURL(blob);
  });
}

export function createCapacitorPlatform(): ReaderPlatform {
  return {
    kind: "capacitor",
    storage,
    pickFile: pickBrowserFile,
    async saveFile(name, blob) {
      await Filesystem.writeFile({
        path: name,
        data: await blobToBase64(blob),
        directory: Directory.Documents,
      });
    },
    async openExternal(url) {
      await Browser.open({ url: url.toString() });
    },
  };
}
