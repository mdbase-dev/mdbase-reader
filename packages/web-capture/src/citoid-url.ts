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
      contentType?.split(";")[0]?.trim().toLowerCase() === "application/pdf"
    ) {
      return undefined;
    }
    // Queries are retained: article identifiers and revision URLs often depend on them.
    // Userinfo is rejected above; fragments are local state and must never be disclosed.
    url.hash = "";
    return url.href;
  } catch {
    return undefined;
  }
}
