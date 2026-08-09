import { basename } from "node:path";

const allowedProtocols = new Set(["https:", "http:"]);

export function validatedExternalUrl(value: string): string {
  const url = new URL(value);
  if (!allowedProtocols.has(url.protocol)) {
    throw new Error("Only HTTP and HTTPS links may leave Reader.");
  }
  return url.toString();
}

export function safeExportName(value: string): string {
  const normalized = basename(value.trim());
  if (!normalized || normalized === "." || normalized === "..") {
    throw new Error("An export requires a safe file name.");
  }
  return normalized;
}
