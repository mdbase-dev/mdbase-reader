const api = "https://chromewebstore.googleapis.com";

export function validateRelease(tag, manifest) {
  const version = tag?.match(/^extension-v(\d+\.\d+\.\d+(?:\.\d+)?)$/u)?.[1];
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
  if (["REJECTED", "CANCELLED"].includes(status.submittedItemRevisionStatus?.state)) {
    throw Object.assign(
      new Error("Resolve the rejected or cancelled Web Store submission first."),
      {
        reason: "store-rejected",
      },
    );
  }
  if (["PENDING_REVIEW", "STAGED"].includes(status.submittedItemRevisionStatus?.state)) {
    throw new Error(
      "An existing submission is pending review or staged. Leave it intact; retry after publishing.",
    );
  }
  if (status.lastAsyncUploadState === "IN_PROGRESS") {
    throw new Error("An earlier upload is still processing. Retry once it completes.");
  }
  if (
    status.lastAsyncUploadState === "FAILED" ||
    (status.submittedItemRevisionStatus?.state &&
      !["PUBLISHED", "PUBLISHED_TO_TESTERS"].includes(status.submittedItemRevisionStatus.state))
  ) {
    throw new Error("Resolve the failed upload or unknown store state before uploading.");
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

function webstoreClient({ publisherId, itemId, token, fetchImpl = fetch }) {
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
      throw Object.assign(
        new Error(
          `Web Store ${step} failed (HTTP ${response.status}${await googleError(response, token)}); inspect the dashboard. No automatic mutation retry.`,
        ),
        {
          reason:
            step === "submission"
              ? "store-submission-failed"
              : step === "upload"
                ? "store-upload-failed"
                : "store-status-unavailable",
        },
      );
    return response.json();
  }
  const statusPath = `v2/${name}:fetchStatus`;
  return { name, request, statusPath };
}

export async function inspectWebstore(options) {
  const { request, statusPath } = webstoreClient(options);
  let status;
  try {
    status = await request("status check", statusPath);
  } catch (error) {
    throw Object.assign(error, { reason: error.reason ?? "store-observer-unavailable" });
  }
  if (status.itemId !== options.itemId)
    throw Object.assign(new Error("Web Store returned an unexpected item ID."), {
      reason: "store-item-binding-required",
    });
  return status;
}

export async function publishWebstore({
  publisherId,
  itemId,
  token,
  version,
  archive,
  fetchImpl = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  beforeUpload = async () => {},
  beforeSubmit = async () => {},
}) {
  const { name, request, statusPath } = webstoreClient({ publisherId, itemId, token, fetchImpl });
  const status = await request("status check", statusPath);
  validateStatus(status, itemId, version);
  await beforeUpload();
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
    throw Object.assign(
      new Error(
        `Upload did not complete successfully (${state}). Inspect the dashboard before retrying.`,
      ),
      { reason: "store-upload-failed" },
    );
  if (!uploaded.crxVersion)
    throw Object.assign(
      new Error(
        "Upload completed but its crxVersion is unknown. CWS v2 fetchStatus exposes no uploaded-draft version; do not submit without verification. Inspect the dashboard. No automatic mutation retry.",
      ),
      { reason: "store-outcome-unknown" },
    );
  if (uploaded.crxVersion !== version)
    throw Object.assign(new Error("Uploaded version does not match release."), {
      reason: "store-outcome-unknown",
    });
  await beforeSubmit();
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

export async function googleError(response, token) {
  let error;
  let raw = "";
  try {
    if (response.text) {
      raw = await response.text();
      error = JSON.parse(raw)?.error;
    } else {
      error = (await response.json())?.error;
    }
  } catch {
    error = undefined;
  }
  const redact = (value) =>
    value
      .split(token)
      .join("[redacted]")
      .replace(/\b(?:ya29\.|Bearer\s+)[\w.~+/=-]+/gu, "[redacted]")
      .replace(/\s+/gu, " ")
      .trim();
  const parts = [error?.status, error?.message]
    .filter((part) => typeof part === "string" && part.trim())
    .map(redact);
  const details = error?.details
    ? JSON.stringify(error.details, (key, value) => {
        if (/token|secret|authorization|credential/iu.test(key)) return "[redacted]";
        return typeof value === "string" ? redact(value) : value;
      })
    : "";
  const body = [...parts, ...(details ? [`details=${details}`] : [])].join(": ") || redact(raw);
  return body ? `: ${body.slice(0, 12000)}${body.length > 12000 ? " [truncated]" : ""}` : "";
}
