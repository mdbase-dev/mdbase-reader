// Safe Actions metadata checkpoints. Persist EACH fetched response before any
// validation or next lookup; never save headers, tokens, arbitrary API payloads.
export function safeArtifact(value) {
  const text = (v) =>
    typeof v === "string" &&
    /^[A-Za-z0-9_.:/-]{1,200}$/.test(v) &&
    !/^(?:gh[pousr]_|github_pat_)|bearer/i.test(v)
      ? v
      : null;
  const number = (v) => (Number.isSafeInteger(v) && v > 0 ? v : null);
  return {
    id: number(value?.id),
    name: text(value?.name),
    expired: typeof value?.expired === "boolean" ? value.expired : null,
    digest: text(value?.digest),
    workflow_run: {
      id: number(value?.workflow_run?.id),
      head_sha: text(value?.workflow_run?.head_sha),
      head_repository_id: number(value?.workflow_run?.head_repository_id),
    },
  };
}
export function safeRun(value) {
  const text = (v) =>
    typeof v === "string" &&
    /^[A-Za-z0-9_./-]{1,200}$/.test(v) &&
    !/^(?:gh[pousr]_|github_pat_)|bearer/i.test(v)
      ? v
      : null;
  const number = (v) => (Number.isSafeInteger(v) && v > 0 ? v : null);
  return {
    id: number(value?.id),
    repository: {
      id: number(value?.repository?.id),
      full_name: text(value?.repository?.full_name),
    },
    head_sha: text(value?.head_sha),
    run_attempt: number(value?.run_attempt),
    event: text(value?.event),
    head_branch: text(value?.head_branch),
  };
}
export function publicMetadataBody(stage, value, httpStatus) {
  if (httpStatus >= 200 && httpStatus < 300)
    return stage === "run" || stage === "runAfter" ? safeRun(value) : safeArtifact(value);
  // Only known public GitHub error text/documentation is retained. Arbitrary
  // strings, URLs, nested bodies and opaque exceptions are NOT safe evidence.
  const allowed = new Set([
    "Not Found",
    "Resource not accessible by integration",
    "Resource not accessible by personal access token",
    "Bad credentials",
    "Requires authentication",
    "Too Many Requests",
    "API rate limit exceeded",
    "You have exceeded a secondary rate limit. Please wait a few minutes before you try again.",
  ]);
  const candidate = typeof value === "string" ? value : value?.message;
  const message = allowed.has(candidate)
    ? candidate
    : typeof candidate === "string" && candidate.startsWith("API rate limit exceeded")
      ? "API rate limit exceeded"
      : null;
  let documentation_url = null;
  try {
    const url = new URL(value?.documentation_url);
    if (
      url.origin === "https://docs.github.com" &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password &&
      /^\/[A-Za-z0-9_./-]*$/.test(url.pathname)
    )
      documentation_url = url.href;
  } catch {
    /* Omit opaque/noncanonical URLs, never log them. */
  }
  return {
    message,
    documentation_url,
    status: String(value?.status) === String(httpStatus) ? String(httpStatus) : null,
    omitted: message === null ? "non-allowlisted-public-body" : null,
  };
}
export function assertRunMetadata(run, expected) {
  if (
    run.id !== Number(expected.run) ||
    run.repository?.id !== Number(expected.repositoryId) ||
    run.repository?.full_name !== expected.repository ||
    run.head_sha !== expected.source ||
    run.run_attempt !== Number(expected.attempt) ||
    run.event !== "workflow_dispatch" ||
    run.head_branch !== `release/native-${expected.target}`
  )
    throw Error("Artifact run attempt/event/ref refused");
}
