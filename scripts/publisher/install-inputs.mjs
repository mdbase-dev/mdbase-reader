// Ephemeral staging install derived only from the authenticated plan. Never repack originals.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { archiveBytes } from "./authentication.mjs";
export async function prepareInstall(plan, root = process.cwd(), fetchImpl = fetch) {
  if (plan.target === "production") return;
  if (plan.target !== "staging") throw Error("Unknown install target");
  const original = plan.sdkTrust.archives.sdk,
    bytes = await archiveBytes(original.path, fetchImpl);
  if (createHash("sha256").update(bytes).digest("hex") !== original.sha256)
    throw Error("Staging original changed");
  await mkdir(join(root, "vendor"), { recursive: true });
  await writeFile(join(root, "vendor/sdk-staging.tgz"), bytes, { flag: "wx" });
  const version = plan.sdkTrust.production.version;
  const lockPath = join(root, "pnpm-lock.yaml"),
    lock = await readFile(lockPath, "utf8");
  if (createHash("sha256").update(lock).digest("hex") !== plan.sdkTrust.lockSha256)
    throw Error("Source lock changed");
  const alias = "@mdbase-dev/sdk-staging@file:vendor/sdk-staging.tgz";
  let staged = lock;
  for (const importer of plan.sdkTrust.sdkImporters) {
    const path = join(root, importer, "package.json"),
      pkg = JSON.parse(await readFile(path, "utf8"));
    if (pkg.dependencies["@mdbase-dev/sdk"] !== version) throw Error("Production SDK pin changed");
    const spec = "file:" + relative(join(root, importer), join(root, "vendor/sdk-staging.tgz"));
    pkg.dependencies["@mdbase-dev/sdk"] = spec;
    await writeFile(path, JSON.stringify(pkg, null, 2) + "\n");
    const before = `\n  ${importer}:\n`,
      block = staged.split(before)[1]?.split(/\n {2}[^ ]/)[0];
    const entry = `'@mdbase-dev/sdk':\n        specifier: ${version}\n        version: ${version}\n`;
    if (!block?.includes(entry)) throw Error("Source frozen importer changed");
    staged = staged.replace(
      before + block,
      before +
        block.replace(
          entry,
          `'@mdbase-dev/sdk':\n        specifier: ${spec}\n        version: '${alias}'\n`,
        ),
    );
  }
  staged = staged
    .replaceAll("@mdbase-dev/sdk@" + version, alias)
    .replace(
      `resolution: {integrity: ${plan.sdkTrust.production.sri}}`,
      `resolution: {integrity: ${original.sri}, tarball: file:vendor/sdk-staging.tgz}\n    name: '@mdbase-dev/sdk-staging'\n    version: ${version}`,
    )
    .replaceAll(`'@mdbase-dev/sdk': ${version}`, `'@mdbase-dev/sdk': '${alias}'`);
  await writeFile(lockPath, staged);
}
if (process.argv[1] === fileURLToPath(import.meta.url))
  await prepareInstall(JSON.parse(await readFile(process.argv[2], "utf8")));
