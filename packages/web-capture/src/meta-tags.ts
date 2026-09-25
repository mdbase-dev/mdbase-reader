export type MetaIndex = ReadonlyMap<string, readonly string[]>;

export function metaIndex(document: Document): MetaIndex {
  const index = new Map<string, string[]>();
  for (const element of document.querySelectorAll<HTMLMetaElement>("meta[name], meta[property]")) {
    const key = (
      element.getAttribute("name") ??
      element.getAttribute("property") ??
      ""
    ).toLowerCase();
    const content = element.content.replace(/\s+/gu, " ").trim();
    if (key && content) {
      index.set(key, [...(index.get(key) ?? []), content]);
    }
  }
  return index;
}

export function first(meta: MetaIndex, ...keys: readonly string[]): string | undefined {
  return keys.map((key) => meta.get(key)?.[0]).find((value) => value !== undefined);
}

export function all(meta: MetaIndex, ...keys: readonly string[]): string[] {
  return keys.flatMap((key) => meta.get(key) ?? []);
}

export function defined(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}
