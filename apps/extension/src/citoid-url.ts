import { citoidUrl } from "@mdbase-reader/web-capture";
const secretParameters = new Set([
  "token",
  "key",
  "sig",
  "signature",
  "auth",
  "session",
  "code",
  "password",
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "apikey",
  "authorization",
  "sessionid",
]);

/** Automatic URL disclosure is conservative: no local names, IP literals or signed links. */
export function citoidCaptureUrl(value: string): string | undefined {
  try {
    const safeUrl = citoidUrl(value);
    if (!safeUrl) {
      return undefined;
    }
    const url = new URL(safeUrl);
    if (
      [...url.searchParams.keys()].some(
        (key) =>
          secretParameters.has(key.toLowerCase().replace(/[-_]/gu, "")) ||
          key
            .toLowerCase()
            .split(/[-_]/u)
            .some((part) => secretParameters.has(part)),
      )
    ) {
      return undefined;
    }
    url.hash = "";
    return url.href;
  } catch {
    return undefined;
  }
}
