import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { test } from "vitest";

import { readerDeployments } from "../../reader/scripts/deployment-environment.mjs";
import { extensionSdk } from "./extension-sdk.mjs";

const repo = new URL("../../../", import.meta.url).pathname;

/** The packaged release trust of the original an alias actually resolves to. */
async function packagedTrust(sdk) {
  const entry = sdk.aliases.find((alias) => alias.find.test("@mdbase-dev/sdk")).replacement;
  let root = dirname(entry);
  while (!root.endsWith("/@mdbase-dev/sdk")) {
    assert.notEqual(root, dirname(root), "SDK alias outside an installed package");
    root = dirname(root);
  }
  const text = await readFile(join(root, "dist/application/packaged-trust.js"), "utf8");
  return JSON.parse(/^const metadata = (\{.*\});$/m.exec(text)[1]);
}

test("each extension build resolves its own environment's packaged SDK", async () => {
  const extension = JSON.parse(await readFile(join(repo, "apps/extension/package.json"), "utf8"));
  const reader = JSON.parse(await readFile(join(repo, "apps/reader/package.json"), "utf8"));
  for (const target of ["lab", "staging", "production"]) {
    const sdk = await extensionSdk({ MDBASE_ENV: target });
    const name = target === "production" ? "@mdbase-dev/sdk" : "@mdbase-dev/sdk-" + target;
    assert.equal(sdk.receipt.environment, target);
    assert.equal(sdk.receipt.cpOrigin, readerDeployments[target].connectUrl);
    assert.ok(extension.dependencies[name].endsWith(sdk.receipt.artifact));
    // The same original Reader's web build bundles for this environment.
    assert.equal(extension.dependencies[name], reader.dependencies[name]);
    const trust = await packagedTrust(sdk);
    assert.equal(trust.environment, target);
    assert.equal(trust.cpOrigin, readerDeployments[target].connectUrl);
    for (const id of ["@mdbase-dev/sdk", "@mdbase-dev/sdk/browser"]) {
      const [alias, ...others] = sdk.aliases.filter((candidate) => candidate.find.test(id));
      assert.ok(alias && others.length === 0);
    }
  }
});

test("an unconfigured extension build is LAB, and so is its SDK", async () => {
  const sdk = await extensionSdk({});
  assert.equal(sdk.receipt.environment, "lab");
  assert.equal((await packagedTrust(sdk)).cpOrigin, "https://connect-lab.mdbase.dev");
});

test("conflicting SDK selectors or Connect origins refuse", async () => {
  for (const environment of [
    { MDBASE_ENV: "lab", VITE_MDBASE_ENV: "production" },
    { VITE_MDBASE_ENV: "staging" },
    { MDBASE_ENV: "staging", VITE_MDBASE_CONNECT_URL: "https://connect.mdbase.dev" },
    { MDBASE_ENV: "qa" },
  ]) {
    await assert.rejects(async () => extensionSdk(environment));
  }
});

test("the extension's Vite config bundles the selected SDK everywhere", async () => {
  const { default: defineExtension } = await import("../vite.config.ts");
  const config = await defineExtension({ command: "build", mode: "production" });
  const expected = (await extensionSdk()).aliases.map(({ replacement }) => replacement);
  assert.deepEqual(
    config.resolve.alias.map(({ replacement }) => replacement),
    expected,
  );
});
