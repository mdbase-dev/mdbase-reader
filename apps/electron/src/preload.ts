import { contextBridge, ipcRenderer } from "electron";

import { electronChannels } from "./channels.js";

export interface ElectronReaderBridge {
  openExternal(url: string): Promise<void>;
  pickFile(
    accept: readonly string[],
  ): Promise<{ readonly name: string; readonly bytes: Uint8Array; readonly size: number } | null>;
  saveFile(name: string, bytes: Uint8Array): Promise<void>;
}

const bridge: ElectronReaderBridge = {
  openExternal: (url) => ipcRenderer.invoke(electronChannels.openExternal, url) as Promise<void>,
  pickFile: (accept) =>
    ipcRenderer.invoke(electronChannels.pickFile, accept) as ReturnType<
      ElectronReaderBridge["pickFile"]
    >,
  saveFile: (name, bytes) =>
    ipcRenderer.invoke(electronChannels.saveFile, name, bytes) as Promise<void>,
};

contextBridge.exposeInMainWorld("mdbaseReader", bridge);
