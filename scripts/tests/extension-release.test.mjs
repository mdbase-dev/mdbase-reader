import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { releasePlan, tagSnapshot, versionParts } from "../extension-release.mjs";

function fixture(context) {
  const cwd = mkdtempSync(join(tmpdir(), "reader-extension-train-"));
  context.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const write = (path, text) => {
    mkdirSync(join(cwd, path, ".."), { recursive: true });
    writeFileSync(join(cwd, path), text);
  };
  const commit = () => {
    git("add", ".");
    git("commit", "-m", "fixture");
  };
  git("init", "-b", "main");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.invalid");
  write(
    "apps/extension/package.json",
    '{"name":"extension","version":"0.5.0","dependencies":{"sdk":"1.0.0"}}\n',
  );
  write("apps/extension/src/main.ts", "original");
  commit();
  git("tag", "extension-v0.5.0");
  return { cwd, git, write, commit };
}

test("unchanged, docs-only and unrelated app changes do not release", (context) => {
  const repo = fixture(context);
  assert.equal(releasePlan(repo.cwd).changed, false);
  repo.write("docs/guide.md", "new docs");
  repo.write("apps/zotero-exporter/src/main.ts", "new exporter");
  repo.commit();
  assert.equal(releasePlan(repo.cwd).changed, false);
});

test("extension, SDK, lock and shared build inputs release once", (context) => {
  for (const path of [
    "apps/extension/src/main.ts",
    "packages/connect/sdk.ts",
    "pnpm-lock.yaml",
    "apps/reader/mdbase/types/source.md",
  ]) {
    const repo = fixture(context);
    repo.write(path, "changed");
    repo.commit();
    const plan = releasePlan(repo.cwd);
    assert.equal(plan.version, "0.5.1");
    const main = repo.git("rev-parse", "main");
    const snapshot = tagSnapshot(repo.cwd, plan);
    assert.notEqual(snapshot, main);
    assert.equal(repo.git("rev-parse", "main"), main);
    assert.equal(repo.git("diff", "--name-only", "main", plan.tag), "apps/extension/package.json");
    repo.git("switch", "main");
    assert.equal(releasePlan(repo.cwd).changed, false);
    repo.write(path, "changed again");
    repo.commit();
    assert.equal(releasePlan(repo.cwd).version, "0.5.2");
  }
});

test("SDK-only repin is a shipped change; preserves explicit higher versions", (context) => {
  const repo = fixture(context);
  const path = join(repo.cwd, "apps/extension/package.json");
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  manifest.dependencies.sdk = "1.0.1";
  repo.write("apps/extension/package.json", JSON.stringify(manifest));
  repo.commit();
  assert.equal(releasePlan(repo.cwd).version, "0.5.1");
  manifest.version = "0.6.0";
  repo.write("apps/extension/package.json", JSON.stringify(manifest));
  repo.commit();
  const plan = releasePlan(repo.cwd);
  assert.equal(plan.version, "0.6.0");
  assert.equal(tagSnapshot(repo.cwd, plan), plan.source);
  repo.git("switch", "main");
  assert.equal(releasePlan(repo.cwd).changed, false);
});

test("version-only change and prerelease tags do not trigger a release", (context) => {
  const repo = fixture(context);
  repo.write(
    "apps/extension/package.json",
    '{"name":"extension","version":"0.6.0","dependencies":{"sdk":"1.0.0"}}',
  );
  repo.commit();
  repo.git("tag", "extension-v99.0.0-beta.1");
  assert.equal(releasePlan(repo.cwd).changed, false);
});

test("dirty, stale, unrelated and mismatched tag histories fail closed", (context) => {
  const repo = fixture(context);
  repo.write("apps/extension/src/main.ts", "changed");
  assert.throws(() => releasePlan(repo.cwd), /clean/u);
  repo.commit();
  const plan = releasePlan(repo.cwd);
  repo.write("packages/core/source.ts", "changed");
  repo.commit();
  assert.throws(() => tagSnapshot(repo.cwd, plan), /stale/u);
  repo.git("tag", "extension-v0.6.0");
  assert.throws(() => releasePlan(repo.cwd), /mismatch/u);
  repo.git("tag", "-d", "extension-v0.6.0");
  repo.git("switch", "--orphan", "other");
  repo.write("apps/extension/package.json", '{"version":"0.7.0"}');
  repo.commit();
  repo.git("tag", "extension-v0.7.0");
  repo.git("switch", "main");
  assert.throws(() => releasePlan(repo.cwd), /main snapshot/u);
});

test("numeric ordering and Chrome limits are enforced", (context) => {
  for (const version of ["0.0.0", "01.2.3", "1.2.65536", "1.2.3-beta.1", "1.2.3.4"]) {
    assert.throws(() => versionParts(version));
  }
  const repo = fixture(context);
  repo.write("apps/extension/package.json", '{"version":"0.10.0"}');
  repo.commit();
  repo.git("tag", "extension-v0.10.0");
  repo.write("apps/extension/src/main.ts", "new code");
  repo.commit();
  assert.equal(releasePlan(repo.cwd).version, "0.10.1");
});

test("CLI pushes exactly one immutable tag, never main, and retry is a no-op", (context) => {
  const repo = fixture(context);
  const remote = mkdtempSync(join(tmpdir(), "reader-extension-remote-"));
  context.after(() => rmSync(remote, { recursive: true, force: true }));
  execFileSync("git", ["init", "--bare", remote], { stdio: "ignore" });
  repo.git("remote", "add", "origin", remote);
  repo.write("apps/extension/src/main.ts", "release this");
  repo.commit();
  repo.git("push", "origin", "main", "--tags");
  const main = repo.git("rev-parse", "main");
  const script = fileURLToPath(new URL("../extension-release.mjs", import.meta.url));
  const run = () =>
    execFileSync(process.execPath, [script, "tag"], {
      cwd: repo.cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  assert.ok(run().includes('"tag":"extension-v0.5.1"'));
  const first = repo.git("ls-remote", "origin", "refs/tags/extension-v0.5.1");
  assert.ok(first);
  assert.ok(repo.git("ls-remote", "origin", "refs/heads/main").startsWith(main));
  repo.git("switch", "main");
  assert.ok(run().includes('"changed":false'));
  assert.equal(repo.git("ls-remote", "origin", "refs/tags/extension-v0.5.1"), first);
  repo.write("apps/extension/src/main.ts", "not on origin/main");
  repo.commit();
  assert.throws(run, /origin\/main/u);
  assert.equal(repo.git("tag", "--list", "extension-v0.5.2"), "");
});

test("missing tags and Chrome patch exhaustion require maintainer action", (context) => {
  const repo = fixture(context);
  repo.git("tag", "-d", "extension-v0.5.0");
  assert.throws(() => releasePlan(repo.cwd), /bootstrap/u);
  repo.write("apps/extension/package.json", '{"version":"0.5.65535"}');
  repo.commit();
  repo.git("tag", "extension-v0.5.65535");
  repo.write("apps/extension/src/main.ts", "release this");
  repo.commit();
  assert.throws(() => releasePlan(repo.cwd), /Invalid Chrome version/u);
});
