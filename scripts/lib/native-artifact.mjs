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
// One SOURCE-owned capture for metadata, redirect and ZIP. Incomplete prefixes
// are bounded identities, NEVER represented as an actual complete ZIP digest.
async function captureResponseBytes(response, limit, timeoutMs) {
  const chunks = [];
  let size = 0,
    reader,
    timer,
    stopped = false,
    complete = false,
    reason = null;
  const deadline = performance.now() + timeoutMs;
  const refuse = (why) => {
    reason ??= why;
  };
  try {
    await Promise.race([
      (async () => {
        const length = response.headers?.get("content-length");
        if (length != null && (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)))) {
          refuse("body-declared-size");
          return;
        }
        if (length != null && Number(length) > limit) {
          refuse("body-byte-limit");
          return;
        }
        if (response.body != null) {
          if (typeof response.body.getReader !== "function") {
            refuse("body-nonbyte-stream");
            return;
          }
          reader = response.body.getReader();
          for (;;) {
            const { done, value } = await reader.read();
            if (stopped) return; // Late reads cannot mutate the checkpoint after timeout.
            if (performance.now() >= deadline) {
              refuse("body-timeout");
              return;
            }
            if (done) break;
            if (!(value instanceof Uint8Array)) {
              refuse("body-nonbyte-chunk");
              return;
            }
            const take = Math.min(value.length, limit - size);
            if (take) {
              chunks.push(Buffer.from(value.subarray(0, take)));
              size += take;
            }
            if (take !== value.length) {
              refuse("body-byte-limit");
              return;
            }
          }
        }
        if (length != null && size !== Number(length)) {
          refuse("body-declared-length-mismatch");
          return;
        }
        complete = true;
      })(),
      new Promise((resolve) => {
        timer = setTimeout(() => {
          stopped = true;
          refuse("body-timeout");
          resolve();
        }, timeoutMs);
      }),
    ]);
  } catch {
    refuse("body-read-error"); // NEVER retain arbitrary exception text.
  } finally {
    stopped = true;
    clearTimeout(timer);
    try {
      Promise.resolve(reader ? reader.cancel() : response.body?.cancel()).catch(() => {});
    } catch {
      /* Bounded best-effort cancellation; no body/error contents. */
    }
  }
  return { bytes: Buffer.concat(chunks, size), complete, reason };
}
export async function boundedResponseBytes(response, limit, timeoutMs) {
  const captured = await captureResponseBytes(response, limit, timeoutMs);
  requireValue(captured.complete, "bounded response body refused");
  return captured.bytes;
}
async function checkpointHttpBody(response, { state, save, limit, timeoutMs, project = true }) {
  state.responses ??= {};
  const status = response.status;
  const entry = {
    httpStatus: Number.isInteger(status) && status >= 100 && status <= 599 ? status : null,
    bodyState: "bounded-public-body-pending",
  };
  state.responses[state.stage] = entry;
  await save(state); // Numeric status IMMEDIATELY, before headers/body/validation.
  const captured = await captureResponseBytes(response, limit, timeoutMs);
  const { bytes, complete, reason } = captured;
  Object.assign(entry, {
    bodyBytes: bytes.length,
    bodySha256: sha(bytes),
    bodyIdentity: complete ? "complete-body" : "incomplete-prefix",
    bodyComplete: complete,
    bodyTruncated: reason === "body-byte-limit",
    bodyReadError: reason === "body-read-error",
    bodyTimedOut: reason === "body-timeout",
    bodyRefusal: reason,
  });
  let parsed,
    validJSON = false;
  if (project && complete) {
    try {
      parsed = JSON.parse(bytes);
      validJSON = true;
    } catch {
      /* Non-JSON redirect is valid DATA. */
    }
    entry.publicBody = publicMetadataBody(state.stage, parsed, status);
  }
  entry.bodyState = !complete
    ? "bounded-public-body-read-refused"
    : !project
      ? "binary-body-not-projected"
      : validJSON
        ? "bounded-public-projection-captured"
        : "non-JSON-public-body-omitted";
  await save(state); // Bounded BODY identity + STATUS BEFORE refusal/NEXT request.
  return { ...captured, parsed, validJSON };
}
export async function checkpointMetadataHttp(response, { state, save, timeoutMs = 30000 }) {
  const captured = await checkpointHttpBody(response, {
    state,
    save,
    limit: 2 * 1024 * 1024,
    timeoutMs: Math.min(30000, timeoutMs),
  });
  requireValue(captured.complete, "bounded metadata body refused");
  requireValue(response.ok, "GitHub metadata HTTP status");
  requireValue(captured.validJSON, "GitHub metadata JSON");
  return captured.parsed;
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
  const deadline = performance.now() + 180000;
  const remaining = (ceiling) => {
    const ms = Math.floor(deadline - performance.now());
    requireValue(ms > 0, "overall transport deadline");
    return Math.min(ceiling, ms);
  };
  const request = async (url, options, ceiling) => {
    const timeoutMs = remaining(ceiling); // Refuse BEFORE starting any out-of-budget request.
    const controller = new AbortController();
    let timer;
    try {
      return await Promise.race([
        transport(url, { ...options, signal: controller.signal }),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(Error("Artifact request timeout"));
          }, timeoutMs);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
  const get = async (path) => {
    const response = await request(
      base + path,
      {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
        redirect: "error",
      },
      30000,
    );
    return checkpointMetadataHttp(response, { state, save, timeoutMs: remaining(30000) });
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
    const response = await request(
      `${base}/actions/artifacts/${expected.id}/zip`,
      {
        headers: { Authorization: `Bearer ${token}` },
        redirect: "manual",
      },
      30000,
    );
    const redirectBody = await checkpointHttpBody(response, {
      state,
      save,
      limit: 2 * 1024 * 1024,
      timeoutMs: remaining(30000),
    });
    requireValue(
      redirectBody.complete && redirectBody.reason === null,
      "complete bounded nontruncated archive redirect body",
    );
    requireValue(response.status === 302, "archive redirect");
    const location = new URL(response.headers.get("location"));
    requireValue(
      location.protocol === "https:" && !location.username && !location.password,
      "archive HTTPS",
    );
    // Never forward GitHub credentials to the blob endpoint.
    state.stage = "blob";
    const blob = await request(location, { redirect: "error", credentials: "omit" }, 60000);
    const captured = await checkpointHttpBody(blob, {
      state,
      save,
      limit: 512 * 1024 * 1024,
      timeoutMs: remaining(60000),
      project: false,
    });
    requireValue(captured.complete, "complete bounded ZIP body");
    const bytes = captured.bytes;
    state.downloadedZip = { bytes: bytes.length, sha256: sha(bytes), complete: true };
    await save(state); // Actual complete downloaded identity BEFORE comparison/NEXT lookup.
    const digestMatches = `sha256:${state.downloadedZip.sha256}` === expected.digest;
    if (!digestMatches)
      state.primaryFailure = { stage: "archive", reason: "download-digest-mismatch" };
    else if (!blob.ok) state.primaryFailure = { stage: "archive", reason: "archive-http-status" };
    await save(state);
    // Mandatory observations even for a COMPLETE bad digest/invalid ZIP. Neither
    // extraction nor bad-SHA authorization may precede BOTH successful checks.
    try {
      await metadataPhase({ expected, get, save, state, after: true });
    } catch {
      if (state.primaryFailure)
        state.secondaryFailure = { stage: state.stage, reason: state.reason };
      throw Error("Artifact post-download metadata refused");
    }
    state.stage = "archive";
    state.reason = state.primaryFailure
      ? "download-validation-refused"
      : "archive-extraction-pending";
    await save(state);
    requireValue(digestMatches, "download digest");
    requireValue(blob.ok, "archive HTTP status");
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
      { timeout: remaining(60000), stdio: ["ignore", "pipe", "pipe"] },
    );
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
    state.primaryFailure ??= { stage: state.stage, reason: state.reason };
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
