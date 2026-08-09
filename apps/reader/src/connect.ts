import {
  ReaderApplicationSession,
  manifestForApplicationUrl,
  type ReaderApplicationSessionOptions,
} from "@mdbase-reader/connect";

import bundledManifest from "./generated/mdbase-app.json";

const applicationUrl = new URL(import.meta.env.BASE_URL, location.origin).href;
const serverParameter = new URL(location.href).searchParams.get("server");
const callbackUrl = new URL(applicationUrl);
if (serverParameter) {
  callbackUrl.searchParams.set("server", new URL(serverParameter).origin);
}
const declaredManifest = bundledManifest as ReaderApplicationSessionOptions["manifest"];
const manifest = isLoopbackApplication(location)
  ? manifestForApplicationUrl(declaredManifest, applicationUrl, callbackUrl.href)
  : declaredManifest;

export const readerSession = new ReaderApplicationSession({
  serverUrl:
    serverParameter ?? import.meta.env.VITE_MDBASE_CONNECT_URL ?? "https://connect.mdbase.dev",
  loopbackUrl: import.meta.env.VITE_MDBASE_CONNECT_LOOPBACK_URL ?? "http://127.0.0.1:28485",
  manifest,
  redirectUri: callbackUrl.href,
  fallbackPath: import.meta.env.BASE_URL,
  // Application startup includes collection setup verification. A remote connector
  // may need more than the SDK's interactive 10-second discovery default.
  timeouts: { watchStartMs: 60_000 },
});

function isLoopbackApplication(current: Location): boolean {
  return (
    current.protocol === "http:" &&
    ["localhost", "127.0.0.1", "::1", "[::1]"].includes(current.hostname)
  );
}
