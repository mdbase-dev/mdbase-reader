const privateSuffixes = [
  ".localhost",
  ".local",
  ".internal",
  ".intranet",
  ".lan",
  ".home",
  ".home.arpa",
  ".corp",
  ".private",
  ".onion",
  ".test",
  ".invalid",
];
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
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/\.$/u, "");
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      !host.includes(".") ||
      host.includes(":") ||
      /^[\d.]+$/u.test(host) ||
      privateSuffixes.some((suffix) => host.endsWith(suffix)) ||
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
