export const readerDeployments = Object.freeze({
  lab: Object.freeze({
    origin: "https://lab.mdbase-reader.pages.dev",
    connectUrl: "https://mdbase-connect-lab.onrender.com",
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
    origin: "https://mdbase-reader.pages.dev",
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
