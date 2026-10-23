import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Reader message identities do not overlap independently authored shared UI", async () => {
  // Inspect deployment bytes: Lingui may extend loaded catalogue objects in place.
  const [own, library] = await Promise.all(
    [
      "../../packages/i18n/locales/en/messages.json",
      "../../apps/reader/node_modules/@mdbase-dev/ui/dist/locales/en/messages.json",
    ].map(async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"))),
  );
  const shared = new Set(Object.keys(library.messages));
  assert.deepEqual(
    Object.keys(own.messages).filter((id) => shared.has(id)),
    [],
  );
});
