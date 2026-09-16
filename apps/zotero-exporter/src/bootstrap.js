/* global Zotero, Services, Cc, Ci, IOUtils, PathUtils, ChromeUtils */
/* eslint no-unused-vars: ["error", {"varsIgnorePattern": "^(startup|shutdown|install|uninstall|onMainWindowLoad|onMainWindowUnload)$"}] */
var ReaderExporter;

function install() {}
function uninstall() {}

function startup({ rootURI }) {
  const scope = {};
  Services.scriptloader.loadSubScript(rootURI + "exporter.js", scope);
  Services.scriptloader.loadSubScript(rootURI + "controller.js", scope);
  const startupService = Cc["@mozilla.org/addons/addon-manager-startup;1"].getService(
    Ci.amIAddonManagerStartup,
  );
  const registration = startupService.registerChrome(
    Services.io.newURI(rootURI + "manifest.json"),
    [["content", "mdbase-reader-exporter", rootURI + "content/"]],
  );
  ReaderExporter = {
    scope,
    registration,
    dialog: null,
    controller: null,
    windows: new Map(),
    stopped: false,
  };
  for (const window of Zotero.getMainWindows()) onMainWindowLoad({ window });
}

function onMainWindowLoad({ window }) {
  const state = ReaderExporter;
  if (!state || state.stopped || state.windows.has(window)) return;
  const menu = window.document.createXULElement("menuitem");
  menu.id = "mdbase-reader-export-menu";
  menu.setAttribute("label", "Export for mdbase Reader…");
  const listener = () => openExporter(window);
  menu.addEventListener("command", listener);
  window.document.getElementById("menu_ToolsPopup").append(menu);
  state.windows.set(window, { menu, listener });
}

function onMainWindowUnload({ window }) {
  const entry = ReaderExporter?.windows.get(window);
  if (!entry) return;
  entry.menu.removeEventListener("command", entry.listener);
  entry.menu.remove();
  ReaderExporter.windows.delete(window);
}

function openExporter(window) {
  const state = ReaderExporter;
  if (!state || state.stopped) return;
  if (state.dialog && !state.dialog.closed) {
    state.dialog.focus();
    return;
  }
  if (!state.controller) {
    const api = state.scope.ReaderZoteroBundle;
    state.controller = new state.scope.ReaderExportController({
      api,
      adapter: api.createZoteroAdapter({ Zotero, IOUtils, PathUtils }),
      join: (...parts) => PathUtils.join(...parts),
      AbortController: window.AbortController,
      suffix: () => Services.uuid.generateUUID().toString().slice(1, 9),
    });
  }
  const controller = state.controller;
  const actions = {
    controller,
    async choose(owner) {
      const { FilePicker } = ChromeUtils.importESModule(
        "chrome://zotero/content/modules/filePicker.mjs",
      );
      const picker = new FilePicker();
      picker.init(owner, "Save migration bundle inside this folder", picker.modeGetFolder);
      if ((await picker.show()) === picker.returnOK && !state.stopped && !owner.closed) {
        await controller.prepare(picker.file);
      }
    },
    async reveal() {
      if (controller.state.destination) await Zotero.File.reveal(controller.state.destination);
    },
    detached() {
      state.dialog = null;
    },
  };
  state.dialog = window.openDialog(
    "chrome://mdbase-reader-exporter/content/export.xhtml",
    "mdbase-reader-exporter",
    "chrome,centerscreen,resizable,dialog=no,width=720,height=700",
    actions,
  );
}

async function shutdown() {
  const state = ReaderExporter;
  if (!state) return;
  state.stopped = true;
  for (const window of [...state.windows.keys()]) onMainWindowUnload({ window });
  await state.controller?.dispose();
  state.dialog?.close();
  state.registration.destruct();
  ReaderExporter = undefined;
}
