/**
 * One web page can arrive under many URLs: tracking parameters, `www.`, AMP
 * variants and trailing slashes. Duplicate detection compares this identity.
 * Meaningful query state such as `?page=2` is kept.
 */
const trackingParameter =
  /^(?:utm_.*|fbclid|gclid|dclid|gbraid|wbraid|msclkid|mc_cid|mc_eid|_hsenc|_hsmi|igshid|ref|ref_src|ref_url|amp)$/iu;

export function normalizedSourceUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  const cached = ampCacheOrigin(url);
  if (cached) {
    return normalizedSourceUrl(cached);
  }
  url.hostname = url.hostname.toLowerCase().replace(/^www\./u, "");
  if (url.protocol === "http:") {
    url.protocol = "https:";
  }
  if (url.port === "443") {
    url.port = "";
  }
  const kept = [...url.searchParams.entries()]
    .filter(([key]) => !trackingParameter.test(key))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  url.search = new URLSearchParams(kept).toString();
  url.pathname = url.pathname.replace(/\/amp\/?$/u, "").replace(/\/+$/u, "") || "/";
  return url.href.replace(/\/$/u, "");
}

/** Records with non-URL identifiers (DOIs, paths) never match a captured page. */
export function sameSourceUrl(value: string, normalized: string): boolean {
  try {
    return normalizedSourceUrl(value) === normalized;
  } catch {
    return false;
  }
}

/**
 * A lowercase host-and-path fragment that every stored spelling of the page
 * contains. Stores use it to narrow candidates before exact comparison.
 */
export function sourceUrlSearchKey(value: string): string {
  const url = new URL(normalizedSourceUrl(value));
  return `${url.hostname}${url.pathname === "/" ? "" : url.pathname}`.toLowerCase();
}

function ampCacheOrigin(url: URL): string | null {
  if (!url.hostname.endsWith(".cdn.ampproject.org")) {
    return null;
  }
  const match = /^\/[a-z]\/(s\/)?(.+)$/u.exec(url.pathname);
  return match?.[2] ? `${match[1] ? "https" : "http"}://${match[2]}${url.search}` : null;
}
