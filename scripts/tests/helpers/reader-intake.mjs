// Historical native-approval fixtures use approved originals, not the current
// multilingual UI candidate. This changes disposable DATA only, never live pins
// or protected approval hashes. Candidate installation is tested separately.
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";

export const approvedUiArchive = "vendor/mdbase-dev-ui-dev-b2d7c464.tgz";
const sri = (bytes) => `sha512-${createHash("sha512").update(bytes).digest("base64")}`;

export async function intakeCopy(target = "staging") {
  const root = await mkdtemp(join(tmpdir(), "reader-intake-data-"));
  try {
    const app = JSON.parse(await readFile("apps/reader/package.json", "utf8"));
    const uiArchive = relative(
      process.cwd(),
      resolve("apps/reader", app.dependencies["@mdbase-dev/ui"].slice("file:".length)),
    );
    const sdk = JSON.parse(
      await readFile("packages/connect/vendor/sdk-production-beta141.json", "utf8"),
    );
    const productionSdk = `packages/connect/vendor/${sdk.artifact}`;
    const stagingSdk = "packages/connect/vendor/sdk-dev-eaa4e697-staging.tgz";
    const paths = [
      "package.json",
      "pnpm-lock.yaml",
      "apps/reader/package.json",
      "apps/extension/package.json",
      "packages/ui/package.json",
      "packages/markdown-editor/package.json",
      "packages/connect/package.json",
      "packages/connect/vendor/native-release",
      target === "staging" ? stagingSdk : productionSdk,
      "packages/connect/vendor/mdbase-dev-connect-protocol-0.1.0-beta.129-c280cd194ffd.tgz",
      approvedUiArchive,
      "vendor/mdbase-dev-sdk-0.0.0-729b5391.tgz",
    ];
    for (const path of paths) {
      await mkdir(join(root, path, ".."), { recursive: true });
      await cp(path, join(root, path), { recursive: true });
    }
    const replacements = [
      [uiArchive, approvedUiArchive],
      [sri(await readFile(uiArchive)), sri(await readFile(approvedUiArchive))],
    ];
    if (target === "staging") {
      replacements.push(
        [productionSdk.split("/").at(-1), stagingSdk.split("/").at(-1)],
        [sri(await readFile(productionSdk)), sri(await readFile(stagingSdk))],
      );
    }
    for (const path of paths.filter((path) => /(?:package\.json|pnpm-lock\.yaml)$/.test(path))) {
      let bytes = await readFile(join(root, path), "utf8");
      for (const [from, to] of replacements) bytes = bytes.replaceAll(from, to);
      await writeFile(join(root, path), bytes);
    }
    return root;
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}
