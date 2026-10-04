import {
  ReaderApplicationSession,
  manifestForApplicationUrl,
  type ReaderApplicationSessionOptions,
  type ReaderSession,
} from "@mdbase-reader/connect";
import { ReaderNextApplicationSession, readerSdkBackend } from "@mdbase-reader/connect/next";

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

const serverUrl =
  serverParameter ?? import.meta.env.VITE_MDBASE_CONNECT_URL ?? "https://connect.mdbase.dev";
// Opt-in mdbase-next backend: `?sdk=next` or VITE_MDBASE_SDK=next. Connect stays the default.
const sdkBackend = readerSdkBackend(
  new URL(location.href).searchParams.get("sdk"),
  import.meta.env.VITE_MDBASE_SDK,
);

export const readerSession: ReaderSession =
  sdkBackend === "next"
    ? new ReaderNextApplicationSession({
        serverUrl,
        app: {
          name: declaredManifest.id,
          version: import.meta.env.VITE_MDBASE_READER_BUILD_ID ?? "development",
        },
        storage: localStorage,
      })
    : connectSession();

function connectSession(): ReaderApplicationSession {
  return new ReaderApplicationSession({
    serverUrl,
    loopbackUrl: import.meta.env.VITE_MDBASE_CONNECT_LOOPBACK_URL ?? "http://127.0.0.1:28485",
    manifest,
    redirectUri: callbackUrl.href,
    fallbackPath: import.meta.env.BASE_URL,
    // Application startup includes collection setup verification. A remote connector
    // may need more than the SDK's interactive 10-second discovery default.
    timeouts: { watchStartMs: 60_000 },
  });
}

function isLoopbackApplication(current: Location): boolean {
  return (
    current.protocol === "http:" &&
    ["localhost", "127.0.0.1", "::1", "[::1]"].includes(current.hostname)
  );
}
