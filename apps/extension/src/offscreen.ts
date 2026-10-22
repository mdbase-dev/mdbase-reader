import { MdbaseConnect } from "@mdbase-reader/connect/native";

import { credentiallessFetch } from "./credentialless-fetch.js";
import { holdSdkHostLock } from "./offscreen-document.js";
import { extensionDeclaration } from "./sdk-declaration.js";
import { sdkHostSource } from "./sdk-host-source.js";
import { serveSdk, type SdkHost } from "./sdk-host.js";
import { broadcastLink } from "./sdk-rpc.js";

/*
 * The extension's one SDK owner. The side panel, settings and welcome pages and the
 * service worker reach it over sdk-rpc.ts; it has no UI. Offscreen documents only get
 * chrome.runtime, so sign-in opens from the page whose action started it.
 */
globalThis.fetch = credentiallessFetch(globalThis.fetch.bind(globalThis));

async function start(): Promise<void> {
  await holdSdkHostLock();
  const hostId = crypto.randomUUID();
  let host: SdkHost | null = null;
  const sdk = new MdbaseConnect(extensionDeclaration(), {
    signIn: { open: (url) => host?.openSignIn(url) },
  });
  const source = sdkHostSource(sdk, hostId);
  host = serveSdk(broadcastLink(), source, hostId);
  // Restores sign-in and the selection from the SDK's own storage.
  await source.application.start().catch(() => undefined);
}

void start();
