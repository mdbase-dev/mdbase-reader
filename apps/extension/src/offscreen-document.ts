import { sdkHostLockName } from "./sdk-rpc.js";

/**
 * The extension's one SDK host is an offscreen document (offscreen.html): a hidden page
 * that can run the SDK's Worker, which an MV3 service worker cannot. The service worker
 * creates it on demand; pages ask the service worker, which owns chrome.offscreen.
 */
export const offscreenPath = "offscreen.html";
export const ensureHostMessage = "mdbase-reader/ensure-sdk-host";

let creating: Promise<void> | null = null;

/** In the service worker: creates the offscreen host unless it is already open. */
export async function ensureOffscreenDocument(): Promise<void> {
  const url = chrome.runtime.getURL(offscreenPath);
  const open = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [url],
  });
  if (open.length) {
    return;
  }
  creating ??= chrome.offscreen
    .createDocument({
      url: offscreenPath,
      reasons: [chrome.offscreen.Reason.WORKERS],
      justification: "Runs the mdbase SDK's worker for saving pages and showing saved highlights.",
    })
    .catch((reason: unknown) => {
      // Another caller created it first.
      if (!/single offscreen document/iu.test(String(reason))) {
        throw reason;
      }
    })
    .finally(() => {
      creating = null;
    });
  await creating;
}

/** In an extension page: asks the service worker for the offscreen host. */
export async function requestSdkHost(): Promise<void> {
  const reply: unknown = await chrome.runtime.sendMessage({ type: ensureHostMessage });
  if (typeof reply === "object" && reply !== null && "error" in reply) {
    throw new Error(String(reply.error));
  }
}

/** Settles once the running host has released its lifetime lock (it closed or crashed). */
export function sdkHostGone(): Promise<void> {
  return navigator.locks.request(sdkHostLockName, () => undefined).then(() => undefined);
}

/** In the offscreen host: holds the lifetime lock until the document goes away. */
export function holdSdkHostLock(): Promise<void> {
  return new Promise((resolve) => {
    void navigator.locks.request(sdkHostLockName, () => {
      resolve();
      return new Promise<never>(() => undefined);
    });
  });
}
