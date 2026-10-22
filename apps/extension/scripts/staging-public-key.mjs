import { createHash, createPublicKey } from "node:crypto";

// The private key stays in the existing user keyring. Source pins ONLY this ID.
export const stagingExtensionId = "palmhjikdacodimpnkapmidobfbocdgf";

/** Chrome derives its ID from the first 128 bits of SHA256(public SPKI DER).
 * This accepts PUBLIC material only; private/PEM/malformed input is refused
 * without echoing any supplied material in an error or log. */
export function chromeIdForPublicKey(publicKey) {
  const refusal = () =>
    new Error("Staging extension public key must be canonical RSA public SPKI DER in base64.");
  try {
    if (typeof publicKey !== "string" || !publicKey.length || publicKey.length > 4096)
      throw refusal();
    const bytes = Buffer.from(publicKey, "base64");
    if (bytes.toString("base64") !== publicKey) throw refusal();
    const key = createPublicKey({ key: bytes, format: "der", type: "spki" });
    if (
      key.asymmetricKeyType !== "rsa" ||
      key.asymmetricKeyDetails.modulusLength < 2048 ||
      !key.export({ format: "der", type: "spki" }).equals(bytes)
    )
      throw refusal();
    return [...createHash("sha256").update(bytes).digest("hex").slice(0, 32)]
      .map((nibble) => String.fromCharCode(97 + Number.parseInt(nibble, 16)))
      .join("");
  } catch {
    throw refusal();
  }
}

export function stagingManifestKey(publicKey) {
  if (chromeIdForPublicKey(publicKey) !== stagingExtensionId) {
    throw new Error("Staging extension public key does not match the allocated staging ID.");
  }
  return publicKey;
}
