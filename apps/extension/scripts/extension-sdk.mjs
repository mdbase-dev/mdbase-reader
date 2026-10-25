import { readerDeploymentFor } from "../../reader/scripts/deployment-environment.mjs";
import { readerSdkTarget, verifiedReaderSdk } from "../../reader/scripts/reader-sdk.mjs";

/**
 * The original SDK this build bundles: the one packaged for the build's own environment, verified
 * exactly as Reader's web build verifies it. Each SDK accepts only its own packaged release trust,
 * so a LAB or staging extension that bundled the production SDK could never start. The extension
 * follows `MDBASE_ENV` (LAB by default) like its manifests; any other SDK selector that names a
 * different environment, or a different Connect origin, refuses.
 */
export function extensionSdk(environment = process.env) {
  const { target } = readerDeploymentFor(environment);
  return verifiedReaderSdk(
    readerSdkTarget({ ...environment, MDBASE_ENV: target }),
    undefined,
    "apps/extension",
  );
}
