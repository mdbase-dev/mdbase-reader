import type { verifiedReaderSdk } from "../../reader/scripts/reader-sdk.mjs";

export function extensionSdk(
  environment?: Readonly<Record<string, string | undefined>>,
): ReturnType<typeof verifiedReaderSdk>;
