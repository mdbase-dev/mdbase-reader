import assert from "node:assert/strict";
import test from "node:test";

import { buildReaderManifest } from "./reader-manifest.mjs";

test("Reader manifest declares exact installation origins for every environment", async () => {
  const manifest = await buildReaderManifest();
  assert.deepEqual(manifest.installation_origins, {
    lab: { "app-runtime": ["https://lab.mdbase-reader.pages.dev"] },
    staging: { "app-runtime": ["https://staging.mdbase-reader.pages.dev"] },
    production: { "app-runtime": ["https://reader.mdbase.dev"] },
  });
});

test("installation origins keep the same app identity and capability scopes", async () => {
  const production = await buildReaderManifest();
  const staging = await buildReaderManifest({
    origin: "https://staging.mdbase-reader.pages.dev",
  });
  assert.equal(staging.homepage, "https://staging.mdbase-reader.pages.dev/");
  assert.deepEqual(staging.installation_origins, production.installation_origins);
  assert.equal(staging.id, production.id);
  assert.deepEqual(staging.requirements, production.requirements);
});
