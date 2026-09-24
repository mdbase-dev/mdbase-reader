import assert from "node:assert/strict";
import test from "node:test";

import {
  assertReproducibleDeployment,
  readerDeploymentFor,
  readerDeployments,
  uncommittedBuildInputs,
} from "./deployment-environment.mjs";

test("Reader deploy:dev targets lab by default", () => {
  assert.deepEqual(readerDeploymentFor({}), {
    target: "lab",
    deployment: readerDeployments.lab,
  });
  assert.equal(readerDeployments.lab.loopbackUrl, "http://127.0.0.1:28487");
});

test("Reader keeps staging and production explicit", () => {
  assert.equal(
    readerDeploymentFor({ MDBASE_ENV: "staging" }).deployment,
    readerDeployments.staging,
  );
  assert.equal(
    readerDeploymentFor({ MDBASE_READER_DEPLOY_TARGET: "production" }).deployment,
    readerDeployments.production,
  );
});

test("Reader production uses the existing Pages origin and staging cannot overwrite it", () => {
  const { deployment } = readerDeploymentFor({ MDBASE_READER_DEPLOY_TARGET: "production" });
  assert.equal(deployment.origin, "https://mdbase-reader.pages.dev");
  assert.equal(deployment.connectUrl, "https://connect.mdbase.dev");
  assert.equal(deployment.loopbackUrl, "http://127.0.0.1:28485");
  assert.equal(deployment.branch, "main");
  assert.equal(readerDeployments.staging.branch, "staging");
  assert.equal(readerDeployments.staging.origin, "https://staging.mdbase-reader.pages.dev");
});

test("Reader refuses conflicting deployment selectors", () => {
  assert.throws(
    () =>
      readerDeploymentFor({
        MDBASE_ENV: "staging",
        MDBASE_READER_DEPLOY_TARGET: "production",
      }),
    /Conflicting/,
  );
});

test("Reader rejects unknown targets and mismatched Connect origins", () => {
  assert.throws(() => readerDeploymentFor({ MDBASE_ENV: "unknown" }), /Unsupported/);
  assert.throws(
    () =>
      readerDeploymentFor({
        MDBASE_ENV: "lab",
        MDBASE_CONNECT_URL: "https://connect.mdbase.dev",
      }),
    /lab Reader requires/,
  );
});

test("Reader refuses staging and production deploys that are not reproducible from a commit", () => {
  const status = " M apps/reader/src/App.tsx\n?? apps/reader/src/New.tsx\n?? screenshot.png\n";
  assert.deepEqual(uncommittedBuildInputs(status), [
    "apps/reader/src/App.tsx",
    "apps/reader/src/New.tsx",
  ]);
  assert.deepEqual(uncommittedBuildInputs(status.trim()), uncommittedBuildInputs(status));
  assert.throws(() => assertReproducibleDeployment("production", status, {}), /uncommitted/u);
  assert.throws(() => assertReproducibleDeployment("staging", status, {}), /uncommitted/u);
  assert.doesNotThrow(() => assertReproducibleDeployment("lab", status, {}));
  assert.doesNotThrow(() => assertReproducibleDeployment("production", "?? screenshot.png\n", {}));
  assert.doesNotThrow(() =>
    assertReproducibleDeployment("production", status, { MDBASE_READER_ALLOW_DIRTY: "1" }),
  );
});
