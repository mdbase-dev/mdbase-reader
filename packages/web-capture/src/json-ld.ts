import { cslName, type CslName } from "./csl-values.js";

const maxValueDepth = 32;
const maxValueWork = 4_096;
const maxArrayValues = 128;

type ValueBudget = { remaining: number };

/** Bound nested arrays as well as graph enumeration; references themselves stay one-hop. */
export function resolveJsonLdReferences(
  value: unknown,
  byId: ReadonlyMap<string, Readonly<Record<string, unknown>>>,
  budget: ValueBudget = { remaining: maxValueWork },
  depth = 0,
): unknown {
  if (depth > maxValueDepth || --budget.remaining < 0) {
    return undefined;
  }
  if (Array.isArray(value)) {
    const resolved: unknown[] = [];
    for (const item of value.slice(0, maxArrayValues)) {
      if (budget.remaining <= 0) {
        break;
      }
      const candidate = resolveJsonLdReferences(item, byId, budget, depth + 1);
      if (candidate !== undefined) {
        resolved.push(candidate);
      }
    }
    return resolved;
  }
  return isRecord(value) && typeof value["@id"] === "string" && Object.keys(value).length === 1
    ? (byId.get(value["@id"]) ?? value)
    : value;
}

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
  return {
    ...node,
    author: resolveJsonLdReferences(node["author"], byId),
    publisher: resolveJsonLdReferences(node["publisher"], byId),
  };
}

function jsonLdNodes(
  value: unknown,
  depth = 0,
  budget: ValueBudget = { remaining: maxValueWork },
): Readonly<Record<string, unknown>>[] {
  if (depth > 4 || --budget.remaining < 0) {
    return [];
  }
  if (Array.isArray(value)) {
    const nodes: Readonly<Record<string, unknown>>[] = [];
    for (const item of value) {
      if (budget.remaining <= 0) {
        break;
      }
      nodes.push(...jsonLdNodes(item, depth + 1, budget));
    }
    return nodes;
  }
  if (!isRecord(value)) {
    return [];
  }
  return [value, ...jsonLdNodes(value["@graph"], depth + 1, budget)];
}

/** People become structured names; organisations and bylines such as "BBC News" stay whole. */
export function jsonLdNames(value: unknown): CslName[] {
  return arrayValue(value)
    .slice(0, maxArrayValues)
    .flatMap((author): CslName[] => {
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
  // Only one path is followed, so the depth cap is also a total work budget (and handles cycles).
  let node = value;
  for (let depth = 0; depth <= maxValueDepth; depth++) {
    if (Array.isArray(node)) {
      node = (node as unknown[])[0];
      continue;
    }
    if (typeof node === "string") {
      return node;
    }
    if (!isRecord(node)) {
      return undefined;
    }
    const personal = [stringValue(node["givenName"]), stringValue(node["familyName"])].filter(
      Boolean,
    );
    const name = stringValue(node["name"]) ?? (personal.length ? personal.join(" ") : undefined);
    if (name) {
      return name;
    }
    node = node["isPartOf"];
  }
  return undefined;
}

export function stringValue(value: unknown): string | undefined {
  const candidate = Array.isArray(value) ? (value as unknown[])[0] : value;
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : undefined;
}

export function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value.slice(0, maxArrayValues) : value === undefined ? [] : [value];
}

export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
