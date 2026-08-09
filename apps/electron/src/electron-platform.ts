import { MemoryStorage, type ReaderPlatform } from "@mdbase-reader/platform";

import type { ElectronReaderBridge } from "./preload.js";

export function createElectronPlatform(bridge: ElectronReaderBridge): ReaderPlatform {
  return {
    kind: "electron",
    storage: new MemoryStorage(),
    async pickFile(accept) {
      const selected = await bridge.pickFile(accept);
      return selected
        ? {
            name: selected.name,
            mediaType: "application/octet-stream",
            size: selected.size,
            bytes: selected.bytes.buffer as ArrayBuffer,
          }
        : null;
    },
    saveFile: async (name, blob) => bridge.saveFile(name, new Uint8Array(await blob.arrayBuffer())),
    openExternal: async (url) => bridge.openExternal(url.toString()),
  };
}
