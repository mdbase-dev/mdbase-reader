import { formatters, i18n } from "@mdbase-reader/i18n";

export function publicationDateLabel(value: string | number | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  const text = String(value).trim();
  const match = /^(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/u.exec(text);
  if (!match?.[1]) {
    return text || null;
  }
  const year = match[1];
  if (!match[2]) {
    return year;
  }
  const month = Number(match[2]);
  const day = Number(match[3] ?? 1);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return text;
  }
  const date = new Date(0);
  date.setUTCFullYear(Number(year), month - 1, day);
  if (date.getUTCMonth() !== month - 1) {
    return text;
  }
  // Retain Reader’s existing day-first English presentation; other locales use
  // their own month names and ordering. Partial dates never invent a visible day.
  const locale = i18n.locale === "en" ? "en-GB" : i18n.locale || "en-GB";
  return formatters(locale).date(date, {
    year: "numeric",
    month: "short",
    ...(match[3] ? ({ day: "numeric" } as const) : {}),
    timeZone: "UTC",
  });
}
