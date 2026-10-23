import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../..");

test("native post-compile removes macros and runs the real English translator", async () => {
  const scratch = resolve(root, ".scratch");
  await mkdir(scratch, { recursive: true });
  const directory = await mkdtemp(resolve(scratch, "native-i18n-"));
  try {
    const file = resolve(directory, "message.js");
    await writeFile(
      file,
      [
        'import { i18n } from "@lingui/core";',
        'import { t, plural } from "@lingui/core/macro";',
        'i18n.load("en", {}); i18n.activate("en");',
        'console.log(t({ message: plural(2, { one: "# document", other: "# documents" }) }));',
      ].join("\n"),
    );
    const build = spawnSync(
      process.execPath,
      [resolve(root, "scripts/compile-native-macros.mjs"), directory],
      { encoding: "utf8" },
    );
    assert.equal(build.status, 0, build.stderr);
    const output = await readFile(file, "utf8");
    assert.doesNotMatch(output, /@lingui\/core\/macro/);
    const run = spawnSync(process.execPath, [file], { encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout.trim(), "2 documents");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
