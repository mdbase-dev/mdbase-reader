import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  extensionEnvironment,
  extensionMdbaseManifest,
} from "../../extension/scripts/extension-manifest.mjs";
import { buildReaderManifest } from "./reader-manifest.mjs";
import { assertValidReaderManifest } from "./validate-manifest.mjs";

const stagingId = "palmhjikdacodimpnkapmidobfbocdgf";
for (const [target, origin] of Object.entries({
  lab: "https://lab.mdbase-reader.pages.dev",
  staging: "https://staging.mdbase-reader.pages.dev",
  production: "https://reader.mdbase.dev",
})) {
  test(`canonical gate accepts the ${target} web manifest`, async () => {
    const manifest = await buildReaderManifest({ origin });
    assert.doesNotThrow(() => assertValidReaderManifest(manifest));
  });
  test(`the SAME canonical gate accepts the ${target} extension manifest`, async () => {
    const reader = await buildReaderManifest({ origin });
    const environment = extensionEnvironment({
      MDBASE_ENV: target,
      ...(target === "staging" ? { MDBASE_EXTENSION_STAGING_ID: stagingId } : {}),
    });
    const manifest = extensionMdbaseManifest(reader, environment);
    assert.doesNotThrow(() => assertValidReaderManifest(manifest));
  });
}

test("extension assembly itself refuses invalid canonical input", async () => {
  const reader = await buildReaderManifest();
  assert.throws(
    () => extensionMdbaseManifest({ ...reader, unrecognised: true }, extensionEnvironment({})),
    /invalid/,
  );
});

test("canonical schema and exact-origin refusals are not weakened", async () => {
  const reader = await buildReaderManifest();
  for (const mutate of [
    (manifest) => {
      manifest.unrecognised = true;
    },
    (manifest) => {
      manifest.installation_origins.preview = { "app-runtime": ["https://preview.example"] };
    },
    (manifest) => {
      manifest.installation_origins.staging["app-runtime"] = ["https://*.mdbase-reader.pages.dev"];
    },
    (manifest) => {
      manifest.installation_origins.staging["app-runtime"] = [
        "https://staging.mdbase-reader.pages.dev/",
      ];
    },
  ]) {
    const candidate = structuredClone(reader);
    mutate(candidate);
    assert.throws(() => assertValidReaderManifest(candidate));
  }
});

test("an explicit LAB development manifest binds only its exact app-loopback origin", async () => {
  const manifest = await buildReaderManifest({ origin: "http://127.0.0.1:5173" });
  assert.deepEqual(manifest.installation_origins.lab, { "app-runtime": ["http://127.0.0.1:5173"] });
  assert.deepEqual(manifest.installation_origins.staging, {
    "app-runtime": ["https://staging.mdbase-reader.pages.dev"],
  });
  assert.deepEqual(manifest.installation_origins.production, {
    "app-runtime": ["https://reader.mdbase.dev"],
  });
  assert.throws(() => assertValidReaderManifest(manifest));
  assert.doesNotThrow(() => assertValidReaderManifest(manifest, { allowLocal: true }));
  manifest.installation_origins.staging["app-runtime"] = ["http://127.0.0.1:5173"];
  assert.throws(() => assertValidReaderManifest(manifest, { allowLocal: true }));
});

test("dev and build:lab declare their LAB environment and manifest origin", async () => {
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.match(pkg.scripts.dev, /VITE_MDBASE_ENV=lab/);
  assert.match(pkg.scripts.dev, /MDBASE_READER_ORIGIN=http:\/\/127\.0\.0\.1:5173/);
  assert.match(pkg.scripts["build:lab"], /VITE_MDBASE_ENV=lab/);
  assert.match(
    pkg.scripts["build:lab"],
    /MDBASE_READER_ORIGIN=https:\/\/lab\.mdbase-reader\.pages\.dev/,
  );
});
