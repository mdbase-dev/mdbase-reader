import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { t } from "@lingui/core/macro";
import { BrowserWindow, app, dialog, ipcMain, shell } from "electron";

import { electronChannels } from "./channels.js";
import { initializeNativeLocale, selectNativeLocale } from "./native-i18n.js";
import { safeExportName, validatedExternalUrl } from "./validation.js";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 780,
    minHeight: 560,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#fcfcfd",
    webPreferences: {
      preload: resolve(sourceDirectory, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const developmentUrl = process.env["MDBASE_READER_DEV_URL"];
  if (developmentUrl) {
    void window.loadURL(developmentUrl);
  } else {
    void window.loadFile(resolve(sourceDirectory, "../../reader/dist/index.html"));
  }
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(validatedExternalUrl(url));
    return { action: "deny" };
  });
  return window;
}

ipcMain.handle(electronChannels.setLocale, async (_event, locale: unknown) =>
  selectNativeLocale(locale),
);
ipcMain.handle(electronChannels.openExternal, async (_event, value: string) =>
  shell.openExternal(validatedExternalUrl(value)),
);
ipcMain.handle(electronChannels.pickFile, async (_event, accept: readonly string[]) => {
  const result = await dialog.showOpenDialog({
    title: t`Open a document`,
    buttonLabel: t({ message: "Open", context: "Open a document from the file picker" }),
    properties: ["openFile"],
    filters: [
      {
        name: t`Readable documents`,
        extensions: accept.map((item) => item.replace(/^\./u, "")),
      },
    ],
  });
  const path = result.filePaths[0];
  if (result.canceled || !path) {
    return null;
  }
  const bytes = await readFile(path);
  return { name: safeExportName(path), bytes, size: bytes.byteLength };
});
ipcMain.handle(electronChannels.saveFile, async (_event, name: string, bytes: Uint8Array) => {
  const result = await dialog.showSaveDialog({
    title: t`Save export`,
    buttonLabel: t({ message: "Save", context: "Save an exported file" }),
    defaultPath: safeExportName(name),
  });
  if (result.canceled || !result.filePath) {
    return;
  }
  await writeFile(result.filePath, bytes);
});

await app.whenReady();
initializeNativeLocale(app.getPath("userData"), app.getPreferredSystemLanguages());
createWindow();
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
