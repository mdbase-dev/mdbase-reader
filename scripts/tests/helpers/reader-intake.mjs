// Historical native-approval fixtures use approved originals, not the current
// multilingual UI candidate. This changes disposable DATA only, never live pins
// or protected approval hashes. Candidate installation is tested separately.
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

export const approvedUiArchive = "vendor/mdbase-dev-ui-dev-b2d7c464.tgz";
const sri = (bytes) => `sha512-${createHash("sha512").update(bytes).digest("base64")}`;

export async function intakeCopy(target = "staging") {
  const root = await mkdtemp(join(tmpdir(), "reader-intake-data-"));
  try {
    const app = JSON.parse(await readFile("apps/reader/package.json", "utf8"));
    const uiVersion = app.dependencies["@mdbase-dev/ui"];
    const lock = parseYaml(await readFile("pnpm-lock.yaml", "utf8"));
    const uiIntegrity = lock.packages[`@mdbase-dev/ui@${uiVersion}`].resolution.integrity;
    const liveSdk = JSON.parse(
      await readFile("packages/connect/vendor/sdk-production-beta157.json", "utf8"),
    );
    const approvedSdk = JSON.parse(
      await readFile("packages/connect/vendor/sdk-production-beta141.json", "utf8"),
    );
    const currentSdk = `packages/connect/vendor/${liveSdk.artifact}`;
    // Native approval stays bound to the historical beta141 original.
    const productionSdk = `packages/connect/vendor/${approvedSdk.artifact}`;
    const stagingSdk = "packages/connect/vendor/sdk-dev-eaa4e697-staging.tgz";
    const intakeSdk = target === "staging" ? stagingSdk : productionSdk;
    const paths = [
      "package.json",
      "pnpm-lock.yaml",
      "apps/reader/package.json",
      "apps/extension/package.json",
      "packages/ui/package.json",
      "packages/markdown-editor/package.json",
      "packages/connect/package.json",
      "packages/connect/vendor/native-release",
      intakeSdk,
      approvedUiArchive,
      "vendor/mdbase-dev-sdk-0.0.0-729b5391.tgz",
    ];
    for (const path of paths) {
      await mkdir(join(root, path, ".."), { recursive: true });
      await cp(path, join(root, path), { recursive: true });
    }
    const replacements = [
      [`@mdbase-dev/ui@${uiVersion}`, `@mdbase-dev/ui@file:${approvedUiArchive}`],
      [
        `resolution: {integrity: ${uiIntegrity}}`,
        `resolution: {integrity: ${sri(await readFile(approvedUiArchive))}, tarball: file:${approvedUiArchive}}`,
      ],
    ];
    replacements.push(
      [currentSdk.split("/").at(-1), intakeSdk.split("/").at(-1)],
      [sri(await readFile(currentSdk)), sri(await readFile(intakeSdk))],
      ["@mdbase-dev/sdk@0.1.0-beta.157", `@mdbase-dev/sdk@file:${intakeSdk}`],
      [
        `resolution: {integrity: ${sri(await readFile(intakeSdk))}}`,
        `resolution: {integrity: ${sri(await readFile(intakeSdk))}, tarball: file:${intakeSdk}}`,
      ],
    );
    for (const path of paths.filter((path) => /(?:package\.json|pnpm-lock\.yaml)$/.test(path))) {
      let bytes = await readFile(join(root, path), "utf8");
      for (const [from, to] of replacements) bytes = bytes.replaceAll(from, to);
      if (path.endsWith("package.json")) {
        const pkg = JSON.parse(bytes);
        if (pkg.dependencies?.["@mdbase-dev/ui"]) {
          pkg.dependencies["@mdbase-dev/ui"] = `file:../../${approvedUiArchive}`;
        }
        if (pkg.dependencies?.["@mdbase-dev/sdk"]) {
          const relative = path.startsWith("apps/")
            ? "../../" + intakeSdk
            : "vendor/" + intakeSdk.split("/").at(-1);
          pkg.dependencies["@mdbase-dev/sdk"] = "file:" + relative;
        }
        bytes = JSON.stringify(pkg, null, 2) + "\n";
      } else {
        // Only disposable historical UI importer entries become file pins;
        // the current npm i18n version and every protected hash stay untouched.
        bytes = bytes.replace(
          /('@mdbase-dev\/ui':\n {8}specifier: )[^\n]+\n {8}version: [^(\n]+/g,
          `$1file:../../${approvedUiArchive}\n        version: file:${approvedUiArchive}`,
        );
        bytes = bytes.replace(
          /('@mdbase-dev\/sdk':\n {8}specifier: )[^\n]+\n {8}version: [^(\n]+/g,
          `$1file:../../${intakeSdk}\n        version: file:${intakeSdk}`,
        );
        bytes = bytes.replace(
          /(\n {2}packages\/connect:\n[\s\S]*?'@mdbase-dev\/sdk':\n {8}specifier: )[^\n]+/,
          `$1file:vendor/${intakeSdk.split("/").at(-1)}`,
        );
      }
      await writeFile(join(root, path), bytes);
    }
    return root;
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}
