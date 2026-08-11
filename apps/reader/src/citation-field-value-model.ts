export type CustomValueType = "boolean" | "json" | "null" | "number" | "string";

export function datePartText(date: Readonly<Record<string, unknown>>, index: number): string {
  const parts = date["date-parts"];
  const part = Array.isArray(parts) && Array.isArray(parts[index]) ? parts[index] : [];
  return part
    .map(String)
    .join("-")
    .replace(/-(\d)(?=-|$)/gu, "-0$1");
}

export function updateDatePart(
  date: Readonly<Record<string, unknown>>,
  index: number,
  text: string,
): Readonly<Record<string, unknown>> {
  const current = Array.isArray(date["date-parts"]) ? [...(date["date-parts"] as unknown[])] : [];
  const parsed = parseDatePart(text);
  if (parsed.length) {
    current[index] = parsed;
  } else {
    current.splice(index, 1);
  }
  return updateObject(date, "date-parts", current.length ? current : undefined);
}

export function parseDatePart(value: string): readonly (number | string)[] {
  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }
  return trimmed
    .split("-")
    .slice(0, 3)
    .map((part) => (/^\d+$/u.test(part) ? Number(part) : part));
}

export function updateObject(
  object: Readonly<Record<string, unknown>>,
  key: string,
  value: unknown,
): Readonly<Record<string, unknown>> {
  if (value === undefined || value === "") {
    return withoutKey(object, key);
  }
  return { ...object, [key]: value };
}

export function renameKey(
  object: Readonly<Record<string, unknown>>,
  oldKey: string,
  nextKey: string,
): Readonly<Record<string, unknown>> {
  return Object.fromEntries(
    Object.entries(object).flatMap(([key, value]) =>
      key === oldKey ? [[nextKey, value]] : [[key, value]],
    ),
  );
}

export function withoutKey(
  object: Readonly<Record<string, unknown>>,
  key: string,
): Readonly<Record<string, unknown>> {
  return Object.fromEntries(Object.entries(object).filter(([name]) => name !== key));
}

export function nextCustomKey(object: Readonly<Record<string, unknown>>): string {
  let index = Object.keys(object).length + 1;
  while (`property-${String(index)}` in object) {
    index += 1;
  }
  return `property-${String(index)}`;
}

export function customValueType(value: unknown): CustomValueType {
  if (value === null) {
    return "null";
  }
  if (typeof value === "boolean") {
    return "boolean";
  }
  if (typeof value === "number") {
    return "number";
  }
  if (typeof value === "string") {
    return "string";
  }
  return "json";
}

export function defaultCustomValue(type: string): unknown {
  if (type === "number") {
    return 0;
  }
  if (type === "boolean") {
    return true;
  }
  if (type === "null") {
    return null;
  }
  if (type === "json") {
    return {};
  }
  return "";
}

export function parseJson(
  value: string,
): { readonly valid: true; readonly value: unknown } | { readonly valid: false } {
  try {
    return { valid: true, value: JSON.parse(value) };
  } catch {
    return { valid: false };
  }
}

export function numberValue(value: string): number | string {
  return value.trim() && Number.isFinite(Number(value)) ? Number(value) : value;
}

export function scalarText(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

export function record(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;
}
