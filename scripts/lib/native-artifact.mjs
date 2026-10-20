// GitHub immutable same-run artifact transport, no project dependencies/hooks.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { assertExtension, assertExtensionZip } from "./reader-extension.mjs";
import { assertOfflineShell } from "./reader-offline-shell.mjs";
import { fileURLToPath } from "node:url";
import { assertInventory, inventoryDirectory } from "./native-publish-bytes.mjs";
const sha = (b) => createHash("sha256").update(b).digest("hex");
const requireValue = (ok, reason) => {
  if (!ok) throw Error(`Artifact refusal: ${reason}`);
};
export { assertArtifactMetadata } from "./native-artifact-checkpoint.mjs";
import { metadataPhase } from "./native-artifact-checkpoint.mjs";
import { publicMetadataBody } from "./native-artifact-evidence.mjs";
export async function assertArtifactDirectory(root, expected, repoRoot = resolve(".")) {
  const envelope = JSON.parse(await readFile(join(root, "envelope.json"), "utf8"));
  for (const key of ["repository", "run", "attempt", "source", "tree", "target", "event"])
    requireValue(envelope[key] === expected[key], `envelope ${key}`);
  const inventoryBytes = await readFile(join(root, "inventory.json"));
  const planBytes = await readFile(join(root, "plan.json"));
  requireValue(
    envelope.inventorySha256 === sha(inventoryBytes) && envelope.planSha256 === sha(planBytes),
    "full inventory/plan binding",
  );
  const plan = JSON.parse(planBytes),
    inventory = JSON.parse(inventoryBytes);
  requireValue(
    plan.sha === expected.source &&
      plan.tree === expected.tree &&
      plan.sdkTrust.environment === expected.target,
    "plan source/tree/target",
  );
  await assertInventory(join(root, "publish"), inventory);
  await assertOfflineShell(join(root, "publish"), inventory, plan.sdkTrust.offlineShell);
  const extensionInventoryBytes = await readFile(join(root, "extension-inventory.json"));
  requireValue(
    envelope.extensionInventorySha256 === sha(extensionInventoryBytes),
    "extension inventory binding",
  );
  const extensionInventory = JSON.parse(extensionInventoryBytes);
  await assertInventory(join(root, "extension"), extensionInventory);
  await assertExtension(root, plan.sdkTrust);
  await assertExtensionZip(root, extensionInventory);
  const zipBytes = await readFile(join(root, "extension.zip"));
  requireValue(envelope.extensionZipSha256 === sha(zipBytes), "extension zip binding");
  const installerBytes = await readFile(join(root, "installer-evidence.json"));
  requireValue(
    envelope.installerEvidenceSha256 === sha(installerBytes),
    "installer evidence binding",
  );
  const installer = JSON.parse(installerBytes);
  requireValue(
    Array.isArray(installer) &&
      installer.length <= 10 &&
      installer.every(
        (r) =>
          r.manager === "pnpm@10.7.0" &&
          r.path === "node_modules/.bin/yaml" &&
          r.originalSdkMembers === plan.sdkTrust.archives.sdk.members &&
          r.originalYamlMembers === plan.sdkTrust.installerPolicy.originalYamlMembers &&
          ["sdk", "protocol"].includes(r.package) &&
          r.originalPackageMembers === plan.sdkTrust.archives[r.package]?.members &&
          r.totalInstalledFiles === r.originalPackageMembers + 1 &&
          /^[a-f0-9]{64}$/.test(r.sha256) &&
          r.bytes > 0,
      ),
    "installer evidence structure; not SDK authority",
  );
  const all = await inventoryDirectory(root);
  const attachments = [
    "envelope.json",
    "inventory.json",
    "plan.json",
    "extension-inventory.json",
    "extension.zip",
    "installer-evidence.json",
  ];
  requireValue(
    all.length === inventory.length + extensionInventory.length + attachments.length &&
      all.every(
        (a) =>
          attachments.includes(a.path) ||
          a.path.startsWith("publish/") ||
          a.path.startsWith("extension/"),
      ),
    "unexpected artifact paths",
  );
  void repoRoot;
  return { plan, inventory, envelope };
}
export async function boundedResponseBytes(response, limit, timeoutMs) {
  const length = response.headers?.get("content-length");
  requireValue(
    length == null ||
      (/^\d+$/.test(length) && Number.isSafeInteger(Number(length)) && Number(length) <= limit),
    "response declared size",
  );
  let reader, timer;
  try {
    return await Promise.race([
      (async () => {
        requireValue(response.body?.getReader, "response byte stream");
        reader = response.body.getReader();
        const chunks = [];
        let size = 0;
        const deadline = performance.now() + timeoutMs;
        for (;;) {
          const { done, value } = await reader.read();
          requireValue(performance.now() < deadline, "response timeout");
          if (done) break;
          requireValue(value instanceof Uint8Array, "response nonbyte chunk");
          size += value.length;
          requireValue(size <= limit, "response byte limit");
          chunks.push(value);
        }
        requireValue(
          length == null || size === Number(length),
          "response declared length mismatch",
        );
        return Buffer.concat(chunks);
      })(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error("Artifact response timeout")), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    try {
      Promise.resolve(reader ? reader.cancel() : response.body?.cancel()).catch(() => {});
    } catch {
      /* Best-effort bounded cancellation; never log response contents. */
    }
  }
}
export async function checkpointMetadataHttp(response, { state, save }) {
  state.responses ??= {};
  const entry = { httpStatus: response.status, bodyState: "bounded-public-body-pending" };
  state.responses[state.stage] = entry;
  await save(state); // numeric status survives even a body/stream failure.
  let bytes;
  try {
    bytes = await boundedResponseBytes(response, 2 * 1024 * 1024, 30000);
  } catch {
    entry.bodyState = "bounded-public-body-read-refused";
    await save(state);
    throw Error("Artifact bounded metadata body refused");
  }
  entry.bodyBytes = bytes.length;
  entry.bodySha256 = sha(bytes);
  let parsed,
    validJSON = true;
  try {
    parsed = JSON.parse(bytes);
  } catch {
    validJSON = false;
  }
  entry.publicBody = publicMetadataBody(state.stage, parsed, response.status);
  entry.bodyState = validJSON
    ? "bounded-public-projection-captured"
    : "non-JSON-public-body-omitted";
  await save(state); // BODY + STATUS before HTTP status/metadata validation.
  requireValue(response.ok, "GitHub metadata HTTP status");
  requireValue(validJSON, "GitHub metadata JSON");
  return parsed;
}
export async function download(expected, root, transport = fetch) {
  requireValue(
    /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(expected.repository ?? "") &&
      [expected.id, expected.run, expected.attempt, expected.repositoryId].every((n) =>
        /^[1-9][0-9]*$/.test(String(n)),
      ) &&
      ["staging", "production"].includes(expected.target) &&
      expected.event === "workflow_dispatch",
    "transport identity",
  );
  requireValue(
    typeof root === "string" && !root.includes("\\") && !root.split("/").includes(".."),
    "download root",
  );
  const token = process.env.GITHUB_TOKEN;
  const base = `https://api.github.com/repos/${expected.repository}`;
  const get = async (path) => {
    const response = await transport(base + path, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
      redirect: "error",
      signal: AbortSignal.timeout(30000),
    });
    return checkpointMetadataHttp(response, { state, save });
  };
  await mkdir(join(root, ".."), { recursive: true });
  const evidence = join(root, "../artifact-metadata.json");
  const state = {
    expected,
    stage: "initial",
    reason: "not-attempted",
    status: "failed-or-incomplete",
  };
  const save = async (value) => writeFile(evidence, JSON.stringify(value, null, 2));
  await save(state);
  try {
    await metadataPhase({ expected, get, save, state });
    state.stage = "archive";
    state.reason = "download-pending";
    await save(state);
    const response = await transport(`${base}/actions/artifacts/${expected.id}/zip`, {
      headers: { Authorization: `Bearer ${token}` },
      redirect: "manual",
      signal: AbortSignal.timeout(30000),
    });
    requireValue(response.status === 302, "archive redirect");
    const location = new URL(response.headers.get("location"));
    requireValue(
      location.protocol === "https:" && !location.username && !location.password,
      "archive HTTPS",
    );
    // Never forward GitHub credentials to the blob endpoint.
    const blob = await transport(location, {
      redirect: "error",
      credentials: "omit",
      signal: AbortSignal.timeout(60000),
    });
    requireValue(blob.ok, "archive HTTP status");
    const bytes = await boundedResponseBytes(blob, 512 * 1024 * 1024, 60000);
    requireValue(`sha256:${sha(bytes)}` === expected.digest, "download digest");
    await mkdir(root, { recursive: true });
    requireValue(
      (await inventoryDirectory(root)).length === 0,
      "extraction destination must be empty and link-free",
    );
    const zip = join(root, "../reader-native.zip");
    await writeFile(zip, bytes, { flag: "wx" });
    // Validate ALL names/modes before extracting; no archive scripts or links.
    execFileSync(
      "python3",
      [
        "-B",
        "-c",
        `import pathlib,stat,sys,zipfile
with zipfile.ZipFile(sys.argv[1]) as z:
 seen=set(); total=0
 for i in z.infolist():
  p=pathlib.PurePosixPath(i.filename)
  assert not p.is_absolute() and all(x not in ('','..','.') for x in i.filename.rstrip('/').split('/')) and '\\\\' not in i.filename
  assert i.orig_filename == i.filename and all(ord(c)>=32 for c in i.filename)
  assert i.filename not in seen and stat.S_IFMT(i.external_attr >> 16) in (0,stat.S_IFREG,stat.S_IFDIR)
  seen.add(i.filename); total+=i.file_size
  assert len(seen)<=20000 and total<=512*1024*1024 and i.file_size<=128*1024*1024
 z.extractall(sys.argv[2])`,
        zip,
        root,
      ],
      { timeout: 60000 },
    );
    await metadataPhase({ expected, get, save, state, after: true });
    state.stage = "inventory";
    state.reason = "validation-pending";
    await save(state);
    requireValue(
      sha(await readFile(zip)) === expected.digest.slice(7),
      "post-download archive digest",
    );
    await assertArtifactDirectory(root, expected);
    state.stage = "complete";
    state.reason = "artifact-validated";
    state.status = "validated";
    await save(state);
  } catch {
    state.status = "failed-or-incomplete";
    if (!state.reason.endsWith("refused")) state.reason = "artifact-stage-refused";
    await save(state);
    throw Error(`Artifact ${state.stage} refused; safe evidence retained`);
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const expected = {
      id: process.env.ARTIFACT_ID,
      digest: `sha256:${(process.env.ARTIFACT_DIGEST ?? "").replace(/^sha256:/, "")}`,
      repository: process.env.GITHUB_REPOSITORY,
      repositoryId: process.env.GITHUB_REPOSITORY_ID,
      run: process.env.GITHUB_RUN_ID,
      attempt: process.env.GITHUB_RUN_ATTEMPT,
      source: process.env.SOURCE_SHA,
      tree: execFileSync("git", ["rev-parse", "HEAD^{tree}"], { encoding: "utf8" }).trim(),
      target: process.env.TARGET,
      event: process.env.GITHUB_EVENT_NAME,
    };
    if (process.argv[2] === "assert") await assertArtifactDirectory(process.argv[3], expected);
    else await download(expected, process.argv[2]);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
