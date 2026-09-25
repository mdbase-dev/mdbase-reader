import { cslName, type CslName } from "./csl-values.js";

export function jsonLdNode(
  document: Document,
  accepts: (type: string) => boolean,
): Readonly<Record<string, unknown>> | undefined {
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(script.textContent);
    } catch {
      continue;
    }
    const nodes = jsonLdNodes(parsed);
    const found = nodes.find((node) =>
      arrayValue(node["@type"]).some((type) => typeof type === "string" && accepts(type)),
    );
    if (found) {
      return withReferencesResolved(found, nodes);
    }
  }
  return undefined;
}

/** Graphs (Yoast, Rank Math) name authors and publishers by `@id` only; inline those nodes. */
function withReferencesResolved(
  node: Readonly<Record<string, unknown>>,
  nodes: readonly Readonly<Record<string, unknown>>[],
): Readonly<Record<string, unknown>> {
  const byId = new Map(
    nodes.flatMap((candidate) => {
      const id = candidate["@id"];
      return typeof id === "string" ? [[id, candidate] as const] : [];
    }),
  );
  const resolved = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(resolved)
      : isRecord(value) && typeof value["@id"] === "string" && Object.keys(value).length === 1
        ? (byId.get(value["@id"]) ?? value)
        : value;
  return { ...node, author: resolved(node["author"]), publisher: resolved(node["publisher"]) };
}

function jsonLdNodes(value: unknown, depth = 0): Readonly<Record<string, unknown>>[] {
  if (depth > 4) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => jsonLdNodes(item, depth + 1));
  }
  if (!isRecord(value)) {
    return [];
  }
  return [value, ...jsonLdNodes(value["@graph"], depth + 1)];
}

/** People become structured names; organisations and bylines such as "BBC News" stay whole. */
export function jsonLdNames(value: unknown): CslName[] {
  return arrayValue(value).flatMap((author): CslName[] => {
    if (typeof author === "string") {
      const name = cslName(author);
      return name ? [name] : [];
    }
    const name = nameOf(author);
    if (!name) {
      return [];
    }
    const organisation =
      isRecord(author) &&
      arrayValue(author["@type"]).some(
        (type) => type === "Organization" || type === "NewsMediaOrganization",
      );
    if (organisation) {
      return [{ literal: name }];
    }
    const parsed = cslName(name);
    return parsed ? [parsed] : [];
  });
}

export function nameOf(value: unknown): string | undefined {
  const node = Array.isArray(value) ? (value as unknown[])[0] : value;
  if (typeof node === "string") {
    return node;
  }
  if (!isRecord(node)) {
    return undefined;
  }
  const personal = [stringValue(node["givenName"]), stringValue(node["familyName"])].filter(
    Boolean,
  );
  return (
    stringValue(node["name"]) ?? (personal.length ? personal.join(" ") : nameOf(node["isPartOf"]))
  );
}

export function stringValue(value: unknown): string | undefined {
  const candidate = Array.isArray(value) ? (value as unknown[])[0] : value;
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : undefined;
}

export function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : value === undefined ? [] : [value];
}

export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
