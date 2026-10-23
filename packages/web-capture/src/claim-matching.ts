import { cslFieldKinds, cslValuesEqual } from "@mdbase-reader/core";

function text(value: string): string {
  return value.replace(/[‘’]/gu, "'").replace(/[“”]/gu, '"').replace(/\s+/gu, " ").trim();
}

function titleKey(value: string): string {
  return text(value)
    .replace(/[.!?,;:]+$/gu, "")
    .trim()
    .toLowerCase();
}

/** A spaced final site separator is not part of the work's title. */
export function splitTitle(value: string): { title: string; suffix?: string } {
  const clean = value.replace(/\s+/gu, " ").trim();
  const match = /^(.*)\s+[-|—·]\s+([^|—·]+)$/u.exec(clean);
  const title = match?.[1]?.trim();
  const suffix = match?.[2]?.trim();
  return title && suffix ? { title, suffix } : { title: clean };
}

function object(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}

function nameKey(value: unknown): string | undefined {
  const name = object(value);
  const family = name?.["family"] ?? name?.["literal"];
  return typeof family === "string" ? text(family).toLowerCase() : undefined;
}

function dateParts(value: unknown): readonly (readonly unknown[])[] | undefined {
  const parts = object(value)?.["date-parts"];
  return Array.isArray(parts) && parts.length && parts.every(Array.isArray)
    ? (parts as unknown[][])
    : undefined;
}

function datePartKey(value: unknown): unknown {
  return typeof value === "string" && /^-?\d+$/u.test(value) ? Number(value) : value;
}

/** Partial dates corroborate compatible, more precise dates, but not conflicting days/months. */
export function claimValuesMatch(field: string, left: unknown, right: unknown): boolean {
  if (field === "title" && typeof left === "string" && typeof right === "string") {
    return titleKey(splitTitle(left).title) === titleKey(splitTitle(right).title);
  }
  if (cslFieldKinds.get(field) === "name" && Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((name, index) => {
        const key = nameKey(name);
        return key !== undefined && key === nameKey(right[index]);
      })
    );
  }
  if (cslFieldKinds.get(field) === "date") {
    const a = dateParts(left);
    const b = dateParts(right);
    if (a && b) {
      return (
        a.length === b.length &&
        a.every((part, index) => {
          const other = b[index];
          return (
            other !== undefined &&
            part.every((n, i) => i >= other.length || datePartKey(n) === datePartKey(other[i]))
          );
        })
      );
    }
  }
  if (typeof left === "string" && typeof right === "string") {
    return text(left).toLowerCase() === text(right).toLowerCase();
  }
  return cslValuesEqual(left, right);
}

export function dateSpecificity(value: unknown): number {
  return dateParts(value)?.reduce((sum, part) => sum + part.length, 0) ?? 0;
}

const agencyNames = new Set([
  "associated press",
  "ap",
  "reuters",
  "agence france-presse",
  "afp",
  "aap",
  "pa media",
  "press association",
  "bloomberg",
  "united press international",
  "dpa",
  "xinhua",
  "kyodo",
]);

function organisationByline(phrase: string): boolean {
  // Two-word names are ambiguous (Jane Press, John Staff); only known agencies bypass the
  // three-word minimum. Explicit JSON-LD organisations already arrive as literal names.
  return (
    agencyNames.has(phrase.toLowerCase()) ||
    (phrase.split(" ").length >= 3 &&
      /\b(?:news|agency|press|media|staff|team|foundation|inc\.?|ltd\.?)$/iu.test(phrase))
  );
}

/** Discard whole role phrases, never personal surnames; keep recognised organisations whole. */
export function withoutRoleNames(value: unknown): unknown {
  if (!Array.isArray(value)) {
    return value;
  }
  return value.flatMap((item: unknown) => {
    const name = object(item);
    if (!name) {
      return [item];
    }
    // cslName parses a comma as "family, given", including corporate suffixes.
    const phrase =
      name["literal"] ??
      (typeof name["given"] === "string" && /^(?:inc|ltd)\.?$/iu.test(name["given"])
        ? `${String(name["family"])}, ${name["given"]}`
        : [name["given"], name["family"]].filter(Boolean).join(" "));
    if (typeof phrase !== "string") {
      return [item];
    }
    const clean = text(phrase);
    if (
      /^(?:https?:)?\/\//iu.test(clean) ||
      /^(?:(?:the )?guardian )?(?:(?:staff|senior|chief|special|political|news|foreign|guest) )*(?:staff|reporters?|correspondents?|editors?|writers?|newsroom|editorial board|editorial team|news desk|press office)$/iu.test(
        clean,
      )
    ) {
      return [];
    }
    return [organisationByline(clean) ? { literal: clean } : item];
  });
}

/** Donors are already ranked: fill missing given names without replacing chosen ones. */
export function fillGivenNames(value: unknown, donors: readonly unknown[]): unknown {
  if (!Array.isArray(value)) {
    return value;
  }
  return value.map((item: unknown, index) => {
    const name = object(item);
    if (!name || name["given"]) {
      return item;
    }
    const donor = donors
      .flatMap((list) => (Array.isArray(list) ? [object(list[index])] : []))
      .find((candidate) => candidate?.["given"]);
    if (!donor) {
      return item;
    }
    if (name["literal"] && donor["family"]) {
      const rest = { ...name };
      delete rest["literal"];
      return { ...rest, family: donor["family"], given: donor["given"] };
    }
    return { ...name, given: donor["given"] };
  });
}

/** Stable JSON order is the last tie-break, independent of claim or object-key order. */
export function valueKey(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(valueKey).join(",")}]`;
  }
  const record = object(value);
  if (record) {
    return `{${Object.keys(record)
      .sort(compareText)
      .map((key) => `${JSON.stringify(key)}:${valueKey(record[key])}`)
      .join(",")}}`;
  }
  return value === undefined ? "undefined" : JSON.stringify(value);
}

export function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
