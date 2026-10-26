import { citoidUrl } from "@mdbase-reader/web-capture";

/** Automatic URL disclosure is conservative: no local names, IP literals or signed links. */
export function citoidCaptureUrl(value: string): string | undefined {
  return citoidUrl(value);
}
