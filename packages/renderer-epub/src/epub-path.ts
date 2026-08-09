export function resolveEpubPath(baseFile: string, reference: string): string {
  const path = reference.split(/[?#]/u, 1)[0] ?? "";
  const base = baseFile.split("/").slice(0, -1);
  const segments = path.startsWith("/") ? [] : base;
  for (const raw of path.split("/")) {
    const segment = decodeSegment(raw);
    if (!segment || segment === ".") {
      continue;
    }
    if (segment === "..") {
      if (segments.length === 0) {
        throw new Error(`EPUB reference escapes its package root: ${reference}`);
      }
      segments.pop();
    } else {
      segments.push(segment);
    }
  }
  return safeEpubPath(segments.join("/"));
}

export function safeEpubPath(value: string): string {
  const normalized = value.replaceAll("\\", "/").replace(/^\.\//u, "");
  if (
    !normalized ||
    normalized.startsWith("/") ||
    normalized.includes("\0") ||
    normalized.split("/").some((segment) => segment === "..")
  ) {
    throw new Error(`EPUB contains an unsafe resource path: ${value}`);
  }
  return normalized;
}

export function epubResourceUrl(baseUrl: string, path: string, fragment?: string): string {
  const encoded = safeEpubPath(path)
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${baseUrl}${encoded}${fragment ? `#${fragment}` : ""}`;
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new Error(`EPUB contains an invalid encoded path segment: ${value}`);
  }
}
