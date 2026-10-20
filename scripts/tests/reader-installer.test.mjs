import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, readFile, chmod, rm, symlink, lstat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { assertInstalledOriginals } from "../lib/native-originals.mjs";
import {
  pnpm107YamlTemplate,
  verifyReaderYamlShim,
  pnpmYamlShim,
  pnpm107ProtocolYamlTemplate,
} from "../lib/reader-pnpm-installer.mjs";
const hash = (b) => createHash("sha256").update(b).digest("hex");
async function fixture() {
  const repo = await mkdtemp(join(tmpdir(), "reader-pnpm-policy-"));
  const sdk = join(repo, "node_modules/.pnpm/sdk-fixture/node_modules/@mdbase-dev/sdk");
  const files = {
    "dist/index.js": "fixture SDK DATA, never executed",
    "node_modules/yaml/package.json": JSON.stringify({
      name: "yaml",
      version: "2.9.1",
      bin: "./bin.mjs",
    }),
    "node_modules/yaml/bin.mjs": "fixture CLI DATA, never executed",
    "node_modules/yaml/dist/index.js": "fixture YAML DATA, never executed",
  };
  const members = [];
  for (const [path, text] of Object.entries(files)) {
    await mkdir(join(sdk, path, ".."), { recursive: true });
    await writeFile(join(sdk, path), text);
    members.push({ path, bytes: Buffer.byteLength(text), sha256: hash(text) });
  }
  members.sort((a, b) => (a.path < b.path ? -1 : 1));
  await mkdir(join(sdk, "node_modules/.bin"));
  const bytes = pnpm107YamlTemplate(repo, sdk);
  await writeFile(join(sdk, pnpmYamlShim), bytes);
  await chmod(join(sdk, pnpmYamlShim), 0o755);
  const options = {
    sdk: true,
    repoRoot: repo,
    packageManager: "pnpm@10.7.0",
    installerEvidence: [],
  };
  return { repo, sdk, members, bytes, options };
}
async function protocolFixture(f) {
  const protocol = join(
      f.repo,
      "node_modules/.pnpm/protocol-fixture/node_modules/@mdbase-dev/connect-protocol",
    ),
    yaml = join(f.repo, "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml");
  for (const row of f.members.filter((m) => m.path.startsWith("node_modules/yaml/"))) {
    const path = join(yaml, row.path.slice("node_modules/yaml/".length));
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, await readFile(join(f.sdk, row.path)));
  }
  await mkdir(join(protocol, "node_modules/.bin"), { recursive: true });
  await symlink(yaml, join(protocol, "../../yaml"));
  const pkg = JSON.stringify({
    name: "@mdbase-dev/connect-protocol",
    dependencies: { yaml: "^2.9.1" },
  });
  await writeFile(join(protocol, "package.json"), pkg);
  const members = [{ path: "package.json", bytes: Buffer.byteLength(pkg), sha256: hash(pkg) }];
  const bytes = pnpm107ProtocolYamlTemplate(f.repo, protocol, yaml);
  await writeFile(join(protocol, pnpmYamlShim), bytes);
  await chmod(join(protocol, pnpmYamlShim), 0o755);
  return {
    protocol,
    yaml,
    members,
    bytes,
    options: {
      ...f.options,
      sdk: false,
      protocol: true,
      originalSdkRoot: f.sdk,
      originalSdkMembers: f.members,
    },
  };
}
test("direct protocol exact PNPM shim additionally binds EVERY external YAML file to original SDK YAML", async () => {
  const f = await fixture();
  try {
    const p = await protocolFixture(f);
    await assertInstalledOriginals(p.protocol, p.members, "protocol fixture", p.options);
    const r = p.options.installerEvidence[0];
    assert.equal(r.package, "protocol");
    assert.equal(r.originalPackageMembers, 1);
    assert.equal(r.originalSdkMembers, 4);
    assert.equal(r.totalInstalledFiles, 2);
    assert.equal(r.originalYamlMembers, 3);
    assert.deepEqual(await readFile(join(p.protocol, pnpmYamlShim)), p.bytes);
  } finally {
    await rm(f.repo, { recursive: true, force: true });
  }
});
for (const mutation of [
  "external-YAML-byte",
  "external-YAML-extra",
  "external-YAML-link",
  "protocol-byte",
  "protocol-shim-target",
  "protocol-extra-bin",
])
  test("protocol installer policy refuses " + mutation, async () => {
    const f = await fixture();
    try {
      const p = await protocolFixture(f);
      if (mutation === "external-YAML-byte")
        await writeFile(join(p.yaml, "dist/index.js"), "altered YAML DATA");
      if (mutation === "external-YAML-extra")
        await writeFile(join(p.yaml, ".hidden-extra"), "extra");
      if (mutation === "external-YAML-link") {
        await rm(join(p.yaml, "bin.mjs"));
        await symlink("dist/index.js", join(p.yaml, "bin.mjs"));
      }
      if (mutation === "protocol-byte") await writeFile(join(p.protocol, "package.json"), "{}");
      if (mutation === "protocol-shim-target")
        await writeFile(
          join(p.protocol, pnpmYamlShim),
          p.bytes.toString().replace("../../../../yaml/bin.mjs", "../evil.js"),
        );
      if (mutation === "protocol-extra-bin")
        await writeFile(join(p.protocol, "node_modules/.bin/other"), "extra");
      await assert.rejects(
        assertInstalledOriginals(p.protocol, p.members, "protocol fixture", p.options),
      );
      assert.equal(p.options.installerEvidence.length, 0);
      assert.ok(await lstat(join(p.protocol, pnpmYamlShim)));
    } finally {
      await rm(f.repo, { recursive: true, force: true });
    }
  });
test("ALL original SDK/YAML members + sole exact PNPM10.7 shim verified separately, no deletion", async () => {
  const f = await fixture();
  try {
    await assertInstalledOriginals(f.sdk, f.members, "fixture originals", f.options);
    const row = f.options.installerEvidence[0];
    assert.equal(row.totalInstalledFiles, 5);
    assert.equal(row.originalSdkMembers, 4);
    assert.equal(row.originalYamlMembers, 3);
    assert.equal(row.sha256, hash(f.bytes));
    assert.equal(row.manager, "pnpm@10.7.0");
    assert.deepEqual(await readFile(join(f.sdk, pnpmYamlShim)), f.bytes);
    assert.ok((await lstat(join(f.sdk, pnpmYamlShim))).isFile());
  } finally {
    await rm(f.repo, { recursive: true, force: true });
  }
});
for (const mutation of [
  "SDK-byte",
  "YAML-byte",
  "shim-extra-command",
  "shim-target",
  "unknown-bin",
  "unknown-hidden",
  "symlink",
  "non-executable",
  "wrong-source-manager",
])
  test(
    "installer policy refuses " + mutation + " without removing or ignoring ANY file",
    async () => {
      const f = await fixture();
      try {
        if (mutation === "SDK-byte")
          await writeFile(join(f.sdk, "dist/index.js"), "altered SDK DATA");
        if (mutation === "YAML-byte")
          await writeFile(join(f.sdk, "node_modules/yaml/dist/index.js"), "altered YAML DATA");
        if (mutation === "shim-extra-command")
          await writeFile(
            join(f.sdk, pnpmYamlShim),
            Buffer.concat([f.bytes, Buffer.from("echo extra\n")]),
          );
        if (mutation === "shim-target")
          await writeFile(
            join(f.sdk, pnpmYamlShim),
            f.bytes.toString().replace("../yaml/bin.mjs", "../evil.js"),
          );
        if (mutation === "unknown-bin")
          await writeFile(join(f.sdk, "node_modules/.bin/other"), "unknown");
        if (mutation === "unknown-hidden") await writeFile(join(f.sdk, ".hidden-extra"), "unknown");
        if (mutation === "symlink") {
          await rm(join(f.sdk, pnpmYamlShim));
          await symlink("../yaml/bin.mjs", join(f.sdk, pnpmYamlShim));
        }
        if (mutation === "non-executable") await chmod(join(f.sdk, pnpmYamlShim), 0o644);
        if (mutation === "wrong-source-manager") f.options.packageManager = "pnpm@11.0.0";
        await assert.rejects(
          assertInstalledOriginals(f.sdk, f.members, "fixture originals", f.options),
        );
        assert.ok(await lstat(join(f.sdk, pnpmYamlShim)));
        assert.equal(f.options.installerEvidence.length, 0);
      } finally {
        await rm(f.repo, { recursive: true, force: true });
      }
    },
  );
test("known template is NOT granted to another PNPM version or another root/target", async () => {
  const f = await fixture();
  try {
    const args = {
      repoRoot: f.repo,
      sdkRoot: f.sdk,
      managerVersion: "10.7.0",
      bytes: f.bytes,
      yamlPackageBytes: await readFile(join(f.sdk, "node_modules/yaml/package.json")),
      originalMembers: f.members,
    };
    assert.throws(() => verifyReaderYamlShim({ ...args, managerVersion: "11.15.0" }));
    assert.throws(() => verifyReaderYamlShim({ ...args, repoRoot: f.repo + "/other" }));
    assert.throws(() =>
      verifyReaderYamlShim({
        ...args,
        originalMembers: f.members.filter((m) => m.path !== "node_modules/yaml/bin.mjs"),
      }),
    );
    assert.throws(() =>
      verifyReaderYamlShim({
        ...args,
        bytes: Buffer.from(f.bytes.toString().replace("$NODE_PATH", "OTHER")),
      }),
    );
    assert.throws(() => pnpm107YamlTemplate("/tmp/unsafe;root", f.sdk));
    assert.throws(() => pnpm107YamlTemplate(f.repo, "/elsewhere/node_modules/@mdbase-dev/sdk"));
  } finally {
    await rm(f.repo, { recursive: true, force: true });
  }
});
