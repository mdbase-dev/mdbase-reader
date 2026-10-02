import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const api = "https://chromewebstore.googleapis.com";

export function validateRelease(tag, manifest) {
  const version = tag?.match(/^extension-v(\d+\.\d+\.\d+)$/u)?.[1];
  if (!version || manifest.version !== version || manifest.manifest_version !== 3) {
    throw new Error("Only stable extension tags matching the packaged MV3 manifest may publish.");
  }
  if (manifest.name !== "mdbase Reader") {
    throw new Error("Only production extension packages may publish.");
  }
  return version;
}

export function validateStatus(status, itemId, version) {
  if (status.itemId !== itemId) throw new Error("Web Store returned an unexpected item ID.");
  if (status.warned || status.takenDown) throw new Error("Resolve Web Store policy issues first.");
  if (["PENDING_REVIEW", "STAGED"].includes(status.submittedItemRevisionStatus?.state)) {
    throw new Error(
      "An existing submission is pending review or staged. Leave it intact; retry after publishing.",
    );
  }
  if (status.lastAsyncUploadState === "IN_PROGRESS") {
    throw new Error("An earlier upload is still processing. Retry once it completes.");
  }
  for (const channel of status.publishedItemRevisionStatus?.distributionChannels ?? []) {
    const parts = version.split(".").map(Number);
    const previous = channel.crxVersion.split(".").map(Number);
    let comparison = 0;
    for (let i = 0; i < 4 && comparison === 0; i++)
      comparison = (parts[i] ?? 0) - (previous[i] ?? 0);
    if (comparison <= 0)
      throw new Error("Release version must exceed the published Web Store version.");
  }
}

export async function publishWebstore({
  publisherId,
  itemId,
  token,
  version,
  archive,
  fetchImpl = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  if (!/^[a-f0-9-]{36}$/u.test(publisherId ?? "") || !/^[a-p]{32}$/u.test(itemId ?? "") || !token) {
    throw new Error("Web Store publisher ID, item ID and access token are required.");
  }
  const name = `publishers/${publisherId}/items/${itemId}`;
  async function request(step, path, options = {}) {
    const response = await fetchImpl(`${api}/${path}`, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, ...options.headers },
      signal: AbortSignal.timeout(120_000),
      redirect: "error",
    });
    if (!response.ok)
      throw new Error(
        `Web Store ${step} failed (HTTP ${response.status}${await googleError(response, token)}); inspect the dashboard. No automatic mutation retry.`,
      );
    return response.json();
  }
  const statusPath = `v2/${name}:fetchStatus`;
  validateStatus(await request("status check", statusPath), itemId, version);
  const uploaded = await request("upload", `upload/v2/${name}:upload`, {
    method: "POST",
    headers: { "Content-Type": "application/zip" },
    body: archive,
  });
  if (uploaded.itemId !== itemId) throw new Error("Upload returned an unexpected item ID.");
  let state = uploaded.uploadState;
  for (let attempt = 0; state === "IN_PROGRESS" && attempt < 30; attempt++) {
    await sleep(10_000);
    state = (await request("upload status check", statusPath)).lastAsyncUploadState;
  }
  if (state !== "SUCCEEDED")
    throw new Error(
      `Upload did not complete successfully (${state}). Inspect the dashboard before retrying.`,
    );
  if (uploaded.crxVersion && uploaded.crxVersion !== version)
    throw new Error("Uploaded version does not match release.");
  const result = await request("submission", `v2/${name}:publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ publishType: "DEFAULT_PUBLISH", blockOnWarnings: true }),
  });
  if (
    result.itemId !== itemId ||
    !["PENDING_REVIEW", "PUBLISHED", "PUBLISHED_TO_TESTERS"].includes(result.state)
  ) {
    throw new Error("Unexpected publish result. Inspect the dashboard before retrying.");
  }
  return result.state;
}

/**
 * Google's own status and message for a failed request, which say what to fix (a missing
 * permission justification, an invalid package). Only those two fields are kept, on one
 * line and bounded, with anything resembling a credential removed: never the raw payload.
 */
export async function googleError(response, token) {
  let error;
  try {
    error = (await response.json())?.error;
  } catch {
    return "";
  }
  const parts = [error?.status, error?.message]
    .filter((part) => typeof part === "string" && part.trim())
    .map((part) =>
      part
        .split(token)
        .join("[redacted]")
        .replace(/\b(?:ya29\.|Bearer\s+)[\w.~+/=-]+/gu, "[redacted]")
        .replace(/\s+/gu, " ")
        .trim(),
    );
  return parts.length ? `: ${parts.join(": ").slice(0, 400)}` : "";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const archivePath = process.argv[2];
    if (!archivePath) throw new Error("Usage: node publish-webstore.mjs <release.zip>");
    const manifest = JSON.parse(
      execFileSync("unzip", ["-p", archivePath, "manifest.json"], { encoding: "utf8" }),
    );
    const version = validateRelease(process.env.GITHUB_REF_NAME, manifest);
    const state = await publishWebstore({
      publisherId: process.env.CWS_PUBLISHER_ID,
      itemId: process.env.CWS_ITEM_ID,
      token: process.env.CWS_ACCESS_TOKEN,
      version,
      archive: await readFile(archivePath),
    });
    console.log(
      `Web Store ${version}: ${state}. Chrome updates store-installed copies after approval/publication.`,
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
