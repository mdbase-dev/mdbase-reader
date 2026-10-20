import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { assertInventory } from "./native-publish-bytes.mjs";
import { join } from "node:path";
import {
  stagingExtensionId,
  stagingManifestKey,
} from "../../apps/extension/scripts/staging-public-key.mjs";
const check = (ok, reason) => {
  if (!ok) throw Error("Extension custody refusal: " + reason);
};
const hash = (b) => createHash("sha256").update(b).digest("hex");
export function assertExtensionManifests(chrome, app, trust) {
  check(trust?.environment === "staging", "only unpacked staging extension is qualified");
  stagingManifestKey(chrome.key);
  check(
    chrome.manifest_version === 3 &&
      chrome.name.endsWith(" (STAGING)") &&
      chrome.homepage_url === trust.appOrigin + "/",
    "Chrome target",
  );
  check(
    app.id === "dev.mdbase.reader.extension" &&
      app.homepage === trust.appOrigin + "/" &&
      JSON.stringify(app.installation_origins) ==
        JSON.stringify({
          staging: { "app-runtime": [`chrome-extension://${stagingExtensionId}`] },
        }),
    "canonical extension identity/origins",
  );
  check(
    chrome.host_permissions.includes(trust.connectOrigin + "/*") &&
      chrome.host_permissions.includes(trust.release.logOrigin + "/*") &&
      !chrome.host_permissions.some((p) => /localhost|127\.0\.0\.1|\[::1\]/.test(p)),
    "exact CP/log and no loopback",
  );
  return {
    publicId: stagingExtensionId,
    publicSpkiSha256: hash(Buffer.from(chrome.key, "base64")),
    webStorePublished: false,
    nativeAdmission: false,
  };
}
export async function assertExtension(root, trust) {
  const chrome = JSON.parse(await readFile(join(root, "extension/manifest.json"), "utf8"));
  const app = JSON.parse(
    await readFile(join(root, "extension/.well-known/mdbase-app.json"), "utf8"),
  );
  return assertExtensionManifests(chrome, app, trust);
}
export async function createExtensionZip(root, inventory) {
  // Standard-library DATA packaging; do not depend on a host zip executable or
  // rebuild the app to recover packaging/verification-only failures.
  await assertInventory(join(root, "extension"), inventory);
  execFileSync(
    "python3",
    [
      "-I",
      "-B",
      "-c",
      `import pathlib,stat,sys,zipfile
root=pathlib.Path(sys.argv[1]);output=pathlib.Path(sys.argv[2])
with zipfile.ZipFile(output,'x',compression=zipfile.ZIP_DEFLATED) as z:
 for path in sorted(root.rglob('*')):
  s=path.lstat();assert not stat.S_ISLNK(s.st_mode)
  if stat.S_ISDIR(s.st_mode):continue
  assert stat.S_ISREG(s.st_mode)
  z.write(path,path.relative_to(root).as_posix())`,
      join(root, "extension"),
      join(root, "extension.zip"),
    ],
    { timeout: 60000, stdio: ["ignore", "pipe", "pipe"] },
  );
  await assertInventory(join(root, "extension"), inventory);
  return assertExtensionZip(root, inventory);
}
export async function assertExtensionZip(root, inventory) {
  // Data-only ZIP validation: exact inventory/all bytes, no extraction/code/hooks.
  const result = execFileSync(
    "python3",
    [
      "-B",
      "-c",
      `import hashlib,json,pathlib,stat,sys,zipfile
rows=[];seen=set();total=0
with zipfile.ZipFile(sys.argv[1]) as z:
 for i in z.infolist():
  name=i.filename;p=pathlib.PurePosixPath(name)
  assert not p.is_absolute() and all(x not in ('','.','..') for x in name.rstrip('/').split('/')) and '\\\\' not in name
  assert i.orig_filename == name and all(ord(c)>=32 for c in name)
  assert stat.S_IFMT(i.external_attr>>16) in (0,stat.S_IFREG,stat.S_IFDIR) and name not in seen
  seen.add(name);total+=i.file_size
  assert len(seen)<=20000 and total<=512*1024*1024 and i.file_size<=128*1024*1024
  if not i.is_dir():
   b=z.read(i);rows.append(dict(path=name,bytes=len(b),sha256=hashlib.sha256(b).hexdigest()))
print(json.dumps(sorted(rows,key=lambda r:r['path'])))`,
      join(root, "extension.zip"),
    ],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: 60000 },
  );
  const rows = JSON.parse(result);
  check(
    JSON.stringify(rows) ===
      JSON.stringify(inventory.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 }))),
    "ZIP exact all bytes/path set",
  );
  return rows;
}
