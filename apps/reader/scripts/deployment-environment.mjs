export const readerDeployments = Object.freeze({
  lab: Object.freeze({
    origin: "https://lab.mdbase-reader.pages.dev",
    connectUrl: "https://connect-lab.mdbase.dev",
    loopbackUrl: "http://127.0.0.1:28487",
    branch: "lab",
  }),
  staging: Object.freeze({
    origin: "https://staging.mdbase-reader.pages.dev",
    connectUrl: "https://connect-staging.mdbase.dev",
    loopbackUrl: "http://127.0.0.1:28486",
    branch: "staging",
  }),
  production: Object.freeze({
    origin: "https://reader.mdbase.dev",
    connectUrl: "https://connect.mdbase.dev",
    loopbackUrl: "http://127.0.0.1:28485",
    branch: "main",
  }),
});

export function readerDeploymentFor(environment) {
  if (
    environment.MDBASE_ENV &&
    environment.MDBASE_READER_DEPLOY_TARGET &&
    environment.MDBASE_ENV !== environment.MDBASE_READER_DEPLOY_TARGET
  ) {
    throw new Error("Conflicting Reader deployment targets; refusing to deploy.");
  }
  const target = environment.MDBASE_ENV ?? environment.MDBASE_READER_DEPLOY_TARGET ?? "lab";
  const deployment = readerDeployments[target];
  if (!deployment) {
    throw new Error(`Unsupported reader deployment target: ${target}.`);
  }
  if (environment.MDBASE_CONNECT_URL && environment.MDBASE_CONNECT_URL !== deployment.connectUrl) {
    throw new Error(
      `${target} Reader requires ${deployment.connectUrl}, received ${environment.MDBASE_CONNECT_URL}.`,
    );
  }
  return { target, deployment };
}

/**
 * Staging and production must be reproducible from a commit. Returns the uncommitted paths that
 * would reach the build, from `git status --porcelain` output; untracked files outside the
 * workspace sources (screenshots, scratch output) cannot and are ignored.
 */
export function uncommittedBuildInputs(porcelain) {
  return porcelain
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      // Status letters, then the path; tolerate a trimmed leading space (" M path").
      const [, status = "", path = ""] = /^\s*(\S{1,2})\s+(.*)$/u.exec(line) ?? [];
      return status !== "??" || /^(apps|packages)\//u.test(path) ? [path] : [];
    });
}

export function assertReproducibleDeployment(target, porcelain, environment) {
  if (target === "lab" || environment.MDBASE_READER_ALLOW_DIRTY === "1") {
    return;
  }
  const paths = uncommittedBuildInputs(porcelain);
  if (paths.length > 0) {
    throw new Error(
      `Refusing to deploy ${target} with uncommitted changes (${paths.slice(0, 5).join(", ")}${paths.length > 5 ? ", …" : ""}). Commit them, or set MDBASE_READER_ALLOW_DIRTY=1 to override.`,
    );
  }
}
