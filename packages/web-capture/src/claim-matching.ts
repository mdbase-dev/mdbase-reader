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
  const clean = text(value);
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
          return other !== undefined && part.every((n, i) => i >= other.length || n === other[i]);
        }) &&
        b.every((part, index) => {
          const other = a[index];
          return other !== undefined && part.every((n, i) => i >= other.length || n === other[i]);
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

/** Match entire role phrases, never a surname alone in a full personal name. */
export function withoutRoleNames(value: unknown): unknown {
  if (!Array.isArray(value)) {
    return value;
  }
  return value.filter((item: unknown) => {
    const name = object(item);
    if (!name) {
      return true;
    }
    const phrase = name["literal"] ?? [name["given"], name["family"]].filter(Boolean).join(" ");
    return (
      typeof phrase !== "string" ||
      !/^(?:(?:the )?guardian )?(?:(?:staff|senior|chief|special|political|news|foreign|guest) )*(?:staff|reporters?|correspondents?|editors?|writers?|newsroom|editorial board|editorial team|news desk|press office)$/iu.test(
        text(phrase),
      )
    );
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
