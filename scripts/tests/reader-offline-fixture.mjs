// Canonical adapter-shaped DATA fixture only, never producer/consumer proof.
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { inventoryDirectory } from "../lib/native-publish-bytes.mjs";
export const digest = (b) => createHash("sha256").update(b).digest("hex");
export async function offlineFixture(root, { extraCached = 0 } = {}) {
  const runtime = "export const fixtureRuntime = true;\n";
  const registration =
    'if ("serviceWorker" in navigator) navigator.serviceWorker.register("/mdbase-shell-sw.js", {scope:"/",type:"module"}).catch(() => console.warn("Offline app support could not start."));\n';
  await mkdir(root, { recursive: true });
  await writeFile(join(root, "mdbase-shell-runtime.js"), runtime);
  await writeFile(join(root, "mdbase-shell-register.js"), registration);
  for (let i = 0; i < extraCached; i++)
    await writeFile(join(root, `fixture-${String(i).padStart(3, "0")}.js`), "fixture " + i);
  const rows = await inventoryDirectory(root);
  const assets = rows
    .filter(
      (r) =>
        !r.path.split("/").some((p) => p.startsWith(".") || p.startsWith("_")) &&
        r.path !== "mdbase-shell-sw.js" &&
        /\.(?:html|js|mjs|css|wasm|woff2?|ttf|svg|png|webp|jpg|jpeg|ico|json|webmanifest)$/.test(
          r.path,
        ),
    )
    .map(({ path, sha256 }) => ({ path, sha256 }));
  const manifest = {
    base: "/",
    version: digest(JSON.stringify({ base: "/", assets, existing: "" })),
    assets,
  };
  const encode = (value) =>
    '\n// mdbase shared offline shell\nimport {installOfflineShell} from "./mdbase-shell-runtime.js";\ninstallOfflineShell(self, ' +
    JSON.stringify(value) +
    ");\n";
  await writeFile(join(root, "mdbase-shell-sw.js"), encode(manifest));
  return {
    manifest,
    encode,
    original: {
      runtime: { bytes: Buffer.byteLength(runtime), sha256: digest(runtime) },
      registration: { bytes: Buffer.byteLength(registration), sha256: digest(registration) },
    },
  };
}
