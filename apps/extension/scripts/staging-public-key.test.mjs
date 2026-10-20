import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";

import { test } from "vitest";

import { extensionEnvironment, extensionManifest } from "./extension-manifest.mjs";
import {
  chromeIdForPublicKey,
  stagingExtensionId,
  stagingManifestKey,
} from "./staging-public-key.mjs";

// An unrelated ephemeral TEST key, not the staging key. Its private component
// stays in memory and is neither persisted nor logged.
const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
const der = pair.publicKey.export({ format: "der", type: "spki" });
const publicKey = der.toString("base64");

test("Chrome ID derivation uses canonical public SPKI bytes", () => {
  const digest = createHash("sha256").update(der).digest();
  const expected = [...digest.subarray(0, 16)]
    .flatMap((byte) => [byte >> 4, byte & 15])
    .map((nibble) => "abcdefghijklmnop"[nibble])
    .join("");
  assert.equal(chromeIdForPublicKey(publicKey), expected);
  assert.match(stagingExtensionId, /^[a-p]{32}$/u);
  assert.notEqual(expected, stagingExtensionId);
});

test("a valid but unrelated public key never becomes the staging identity", () => {
  assert.throws(() => stagingManifestKey(publicKey), /allocated staging ID/);
  const environment = extensionEnvironment({
    MDBASE_ENV: "staging",
    MDBASE_EXTENSION_STAGING_ID: stagingExtensionId,
    MDBASE_EXTENSION_STAGING_PUBLIC_KEY: publicKey,
  });
  assert.throws(() => extensionManifest(environment), /allocated staging ID/);
});

test("private, malformed and noncanonical input is refused without material in errors", () => {
  const privateKey = pair.privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
  for (const value of [undefined, "", "not-base64", `${publicKey}\n`, privateKey]) {
    assert.throws(
      () => chromeIdForPublicKey(value),
      (error) => {
        assert.match(error.message, /public key/);
        if (value) assert.equal(error.message.includes(value), false);
        return true;
      },
    );
  }
});

test("staging public material cannot be injected into LAB or production", () => {
  for (const target of ["lab", "production"]) {
    assert.throws(
      () =>
        extensionEnvironment({
          MDBASE_ENV: target,
          MDBASE_EXTENSION_STAGING_PUBLIC_KEY: publicKey,
        }),
      /staging builds only/,
    );
    assert.equal("key" in extensionManifest(extensionEnvironment({ MDBASE_ENV: target })), false);
  }
});
