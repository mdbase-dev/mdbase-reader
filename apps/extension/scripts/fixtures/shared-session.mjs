/* global __SESSION_HOST__ */
import { createMdbase } from "@mdbase-dev/sdk";

const origin = globalThis.location.origin;
const manifest = {
  manifest_version: 1,
  id: "dev.mdbase.reader.extension.session-test",
  name: "Reader shared session test",
  homepage: `${origin}/`,
  redirect_uris: [`${origin}/`],
  requirements: {
    access: "full_collection",
    contracts: [],
    capabilities: { contract_version: 2, required: [], optional: [] },
  },
};
const app = createMdbase(
  { id: manifest.id, name: manifest.name, origin, environment: "production", manifest },
  {
    session: { build: "reader-extension-session-test", host: __SESSION_HOST__ },
    unsynced: true,
    followVisibility: false,
  },
);
globalThis.fixtureMdbase = app;
void app.start().catch((error) => {
  globalThis.fixtureError = error.message;
});
