import assert from "node:assert/strict";
import test from "node:test";

import {
  extensionEnvironment,
  extensionManifest,
} from "../../apps/extension/scripts/extension-manifest.mjs";
import {
  chromeLocales,
  chromeMessages,
  shellCatalogue,
} from "../../apps/extension/scripts/localized-shell.mjs";

test("Chrome manifest names its default catalogue and all localized shell keys resolve", () => {
  const manifest = extensionManifest(extensionEnvironment({}));
  assert.equal(manifest.default_locale, "en");
  const english = chromeMessages("en");
  assert.equal(
    english.description.message,
    "Save the page you are reading and revisit your mdbase annotations.",
  );
  for (const value of [
    manifest.description,
    manifest.action.default_title,
    ...Object.values(manifest.commands).map((command) => command.description),
  ]) {
    const key = /__MSG_(\w+)__/.exec(value)?.[1];
    assert.ok(key && key in english, `Unresolved Chrome message: ${value}`);
  }
  assert.deepEqual(Object.keys(chromeLocales).sort(), [
    "de",
    "en",
    "es",
    "fr",
    "it",
    "ja",
    "ko",
    "pt",
    "ru",
    "zh",
  ]);
  assert.equal(chromeLocales.it, "it");
  assert.equal(chromeMessages("it").actionTitle.message, "Salva in mdbase Reader");
  assert.equal(chromeLocales.pt, "pt_BR");
  assert.equal(chromeLocales.zh, "zh_CN");
  for (const locale of Object.keys(chromeLocales)) {
    assert.deepEqual(Object.keys(chromeMessages(locale)), Object.keys(english));
    assert.ok(Object.keys(JSON.parse(shellCatalogue(locale)).messages).length > 1000);
  }
});
