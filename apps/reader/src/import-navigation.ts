export function importHref(
  service = "",
  current = typeof location === "undefined" ? "http://localhost/" : location.href,
  base = import.meta.env.BASE_URL,
): string {
  const url = new URL(`import${service ? `/${service}` : ""}`, new URL(base, current));
  const source = new URL(current);
  for (const key of ["collection", "server"]) {
    const value = source.searchParams.get(key);
    if (value) {
      url.searchParams.set(key, value);
    }
  }
  return url.pathname + url.search;
}
export function importService(
  path: string,
  base = import.meta.env.BASE_URL,
): "home" | "zotero" | "readwise" | null {
  const prefix = `${base.replace(/\/$/u, "")}/import`;
  const normalized = path.replace(/\/$/u, "");
  return normalized === prefix
    ? "home"
    : normalized === `${prefix}/zotero`
      ? "zotero"
      : normalized === `${prefix}/readwise`
        ? "readwise"
        : null;
}
