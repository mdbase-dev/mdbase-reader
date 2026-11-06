import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { parse } from "yaml";
import { prepareInstall } from "./install-inputs.mjs";
import { productionPin } from "./originals.mjs";
it("derives all SDK peer installs from the production pin without changing other source pins or archived staging aliases", async () => {
  const source = new URL("../../", import.meta.url).pathname,
    root = await mkdtemp(join(tmpdir(), "reader-stage-install-"));
  try {
    const { pin } = await productionPin(source),
      lock = await readFile(join(source, "pnpm-lock.yaml"), "utf8"),
      bytes = Buffer.from("authenticated staging original");
    const sdkImporters = ["apps/reader", "apps/extension", "packages/connect"];
    for (const path of sdkImporters) {
      await mkdir(join(root, path), { recursive: true });
      await cp(join(source, path, "package.json"), join(root, path, "package.json"));
    }
    await writeFile(join(root, "pnpm-lock.yaml"), lock);
    const original = parse(lock),
      sdk = {
        path: "https://example.invalid/staging",
        sha256: createHash("sha256").update(bytes).digest("hex"),
        sri: "sha512-staging",
      };
    const plan = {
      target: "staging",
      sdkTrust: {
        archives: { sdk },
        production: { version: pin.version, sri: pin.sri },
        lockSha256: createHash("sha256").update(lock).digest("hex"),
        sdkImporters,
      },
    };
    await prepareInstall(plan, root, async () => new Response(bytes));
    assert((await readFile(join(root, "vendor/sdk-staging.tgz"))).equals(bytes));
    const changed = parse(await readFile(join(root, "pnpm-lock.yaml"), "utf8"));
    for (const path of sdkImporters) {
      const pkg = JSON.parse(await readFile(join(root, path, "package.json"), "utf8"));
      assert.equal(pkg.dependencies["@mdbase-dev/sdk"], "file:../../vendor/sdk-staging.tgz");
      const before = JSON.parse(await readFile(join(source, path, "package.json"), "utf8"));
      pkg.dependencies["@mdbase-dev/sdk"] = before.dependencies["@mdbase-dev/sdk"];
      assert.deepEqual(pkg, before);
      assert.equal(
        changed.importers[path].dependencies["@mdbase-dev/sdk"].version,
        "@mdbase-dev/sdk-staging@file:vendor/sdk-staging.tgz",
      );
      if (original.importers[path].dependencies["@mdbase-dev/sdk-staging"])
        assert.deepEqual(
          changed.importers[path].dependencies["@mdbase-dev/sdk-staging"],
          original.importers[path].dependencies["@mdbase-dev/sdk-staging"],
        );
    }
    assert.equal(
      changed.packages["@mdbase-dev/sdk-staging@file:vendor/sdk-staging.tgz"].resolution.integrity,
      "sha512-staging",
    );
    await assert.rejects(
      prepareInstall(plan, root, async () => new Response("wrong")),
      /Staging original changed/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
