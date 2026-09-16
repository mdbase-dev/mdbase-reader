const shortMonths = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

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
  const month = shortMonths[Number(match[2]) - 1];
  if (!month) {
    return text;
  }
  if (!match[3]) {
    return `${month} ${year}`;
  }
  const day = Number(match[3]);
  return day >= 1 && day <= 31 ? `${String(day)} ${month} ${year}` : text;
}
