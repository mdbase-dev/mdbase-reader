export type AddressResolver = (hostname: string) => Promise<readonly string[]>;

const blockedHostSuffixes = [
  ".home.arpa",
  ".internal",
  ".invalid",
  ".lan",
  ".local",
  ".localhost",
  ".onion",
  ".test",
] as const;

const reservedIpv4Ranges = [
  [0x00000000, 0x00ffffff],
  [0x0a000000, 0x0affffff],
  [0x64400000, 0x647fffff],
  [0x7f000000, 0x7fffffff],
  [0xa9fe0000, 0xa9feffff],
  [0xac100000, 0xac1fffff],
  [0xc0000000, 0xc00000ff],
  [0xc0000200, 0xc00002ff],
  [0xc0586300, 0xc05863ff],
  [0xc0a80000, 0xc0a8ffff],
  [0xc6120000, 0xc613ffff],
  [0xc6336400, 0xc63364ff],
  [0xcb007100, 0xcb0071ff],
  [0xe0000000, 0xffffffff],
] as const;

export class CapturePolicyError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "CapturePolicyError";
  }
}

export async function publicCaptureUrl(
  value: string,
  resolveAddresses: AddressResolver,
): Promise<URL> {
  const url = parseCaptureUrl(value);
  const hostname = normalizedHostname(url);
  if (blockedHostname(hostname)) {
    throw blockedAddress();
  }
  if (isIpAddress(hostname)) {
    if (!isPublicAddress(hostname)) {
      throw blockedAddress();
    }
    return url;
  }
  const addresses = await resolveAddresses(hostname);
  if (addresses.length === 0) {
    throw new CapturePolicyError("unresolvable_url", "Reader could not resolve that address.");
  }
  if (addresses.some((address) => !isPublicAddress(address))) {
    throw blockedAddress();
  }
  return url;
}

export function parseCaptureUrl(value: string): URL {
  if (value.length > 2048) {
    throw new CapturePolicyError("invalid_url", "The web address is too long.");
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new CapturePolicyError("invalid_url", "Enter a complete HTTPS web address.");
  }
  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    (url.port !== "" && url.port !== "443")
  ) {
    throw new CapturePolicyError(
      "unsafe_url",
      "Reader captures public HTTPS pages without credentials or custom ports.",
    );
  }
  url.hash = "";
  return url;
}

export function isPublicAddress(value: string): boolean {
  const address = value
    .trim()
    .toLocaleLowerCase()
    .replace(/^\[|\]$/gu, "");
  return address.includes(":") ? isPublicIpv6(address) : isPublicIpv4(address);
}

function normalizedHostname(url: URL): string {
  return url.hostname
    .toLocaleLowerCase()
    .replace(/\.$/u, "")
    .replace(/^\[|\]$/gu, "");
}

function blockedHostname(hostname: string): boolean {
  return (
    hostname.length === 0 ||
    (!hostname.includes(".") && !isIpAddress(hostname)) ||
    hostname === "localhost" ||
    hostname === "metadata.google.internal" ||
    blockedHostSuffixes.some((suffix) => hostname.endsWith(suffix))
  );
}

function isIpAddress(value: string): boolean {
  return value.includes(":") || ipv4Parts(value) !== null;
}

function isPublicIpv4(value: string): boolean {
  const parts = ipv4Parts(value);
  if (!parts) {
    return false;
  }
  const address = parts.reduce((total, part) => total * 256 + part, 0);
  return reservedIpv4Ranges.every(([start, end]) => address < start || address > end);
}

function ipv4Parts(value: string): readonly number[] | null {
  const parts = value.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/u.test(part) || Number(part) > 255)) {
    return null;
  }
  return parts.map(Number);
}

function isPublicIpv6(value: string): boolean {
  if (value.startsWith("::ffff:")) {
    return isPublicIpv4(value.slice("::ffff:".length));
  }
  const first = Number.parseInt(value.split(":", 1)[0] ?? "", 16);
  return (
    Number.isFinite(first) && first >= 0x2000 && first <= 0x3fff && !value.startsWith("2001:db8:")
  );
}

function blockedAddress(): CapturePolicyError {
  return new CapturePolicyError(
    "private_address",
    "Reader cannot capture private, local, or reserved network addresses.",
  );
}
