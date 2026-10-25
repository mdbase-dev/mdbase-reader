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

/** Validate at the disclosure boundary, not just in a particular UI. No DNS lookup is made. */
export function citoidUrl(value: string, contentType?: string): string | undefined {
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
      /\.pdf(?:$|\/)/iu.test(decodeURIComponent(url.pathname)) ||
      contentType?.split(";")[0]?.trim().toLowerCase() === "application/pdf" ||
      [...url.searchParams.keys()].some(secretParameter)
    ) {
      return undefined;
    }
    // Other queries are retained: article identifiers and revision URLs often depend on them.
    // Signed or session links are refused above rather than trimmed, since the remainder may
    // still identify the user. Fragments are local state and are never disclosed.
    url.hash = "";
    return url.href;
  } catch {
    return undefined;
  }
}

function secretParameter(key: string): boolean {
  const name = key.toLowerCase();
  return (
    secretParameters.has(name.replace(/[-_]/gu, "")) ||
    name.split(/[-_]/u).some((part) => secretParameters.has(part))
  );
}
