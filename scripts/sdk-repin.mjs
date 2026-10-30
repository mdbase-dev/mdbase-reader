import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function productionIdentity(record, release, tag) {
  if (!/^v0\.1\.0-beta\.[1-9][0-9]*$/.test(release)) {
    throw new Error("connect_release must be v0.1.0-beta.N");
  }
  const recordedRelease = record.match(/^MDBASE_CONNECT_RELEASE=(.+)$/m)?.[1];
  const commit = record.match(/^MDBASE_CONNECT_COMMIT=([0-9a-f]{40})$/m)?.[1];
  if (recordedRelease !== release || !commit || tag !== commit) {
    throw new Error("Connect tag does not match ops main's production record");
  }
  return commit;
}

export function repinPlan(manifests, version) {
  const packages = new Set(["@mdbase-dev/sdk"]);
  const changes = [];
  for (const { path, text } of manifests) {
    const manifest = JSON.parse(text);
    let changed = false;
    for (const section of [
      "dependencies",
      "devDependencies",
      "optionalDependencies",
      "peerDependencies",
    ]) {
      for (const [name, pin] of Object.entries(manifest[section] ?? {})) {
        if (!name.startsWith("@mdbase-dev/")) continue;
        if (name !== "@mdbase-dev/sdk" && /^(file:|workspace:|link:)/.test(pin)) continue;
        if (/^@mdbase-dev\/sdk-/.test(name)) continue;
        if (/^(npm:|git|https?:)/.test(pin)) {
          throw new Error(`Unsupported runtime pin: ${path}: ${name}`);
        }
        packages.add(name);
        if (pin !== version) {
          manifest[section][name] = version;
          changed = true;
        }
      }
    }
    if (changed) {
      changes.push({ path, text: JSON.stringify(manifest, null, 2) + "\n" });
    }
  }
  return { packages: [...packages].sort(), changes };
}

function execute(...args) {
  return execFileSync(args[0], args.slice(1), {
    encoding: "utf8",
    timeout: 60_000,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function main() {
  const release = process.env.CONNECT_RELEASE ?? "";
  if (!/^v0\.1\.0-beta\.[1-9][0-9]*$/.test(release)) {
    throw new Error("connect_release must be v0.1.0-beta.N");
  }
  const record = JSON.parse(
    execute("gh", "api", "repos/mdbase-dev/mdbase-cloud-ops/contents/render/release.env?ref=main"),
  );
  const tag = execute(
    "git",
    "ls-remote",
    "https://github.com/mdbase-dev/mdbase-connect.git",
    `refs/tags/${release}^{}`,
  ).split(/\s/)[0];
  const commit = productionIdentity(
    Buffer.from(record.content, "base64").toString("utf8"),
    release,
    tag,
  );
  const manifests = execute("git", "ls-files", "-z", "*package.json")
    .split("\0")
    .filter(Boolean)
    .map((path) => ({ path, text: readFileSync(path, "utf8") }));
  const plan = repinPlan(manifests, release.slice(1));
  for (const name of plan.packages) {
    let published;
    try {
      published = JSON.parse(
        execute(
          "npm",
          "view",
          `${name}@${release.slice(1)}`,
          "version",
          "--json",
          "--registry=https://registry.npmjs.org",
          "--fetch-retries=0",
        ),
      );
    } catch {
      throw new Error(
        `${name}@${release.slice(1)} is unavailable; no partial repin. SDK npm publication requires Connect PR 1076 and a published production release.`,
      );
    }
    if (published !== release.slice(1)) {
      throw new Error(`Registry identity mismatch for ${name}`);
    }
  }
  for (const change of plan.changes) writeFileSync(change.path, change.text);
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `changed=${plan.changes.length > 0}\ncommit=${commit}\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
