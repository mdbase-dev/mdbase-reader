/**
 * The Private collection consent popup comes back to the app's redirect URI (the
 * app root) with `state` and `code` or `error`. That window only hands the result
 * to the waiting reader tab and closes: it never starts a second mdbase entry.
 */
export function isAppGrantCallback(url: URL): boolean {
  return (
    url.searchParams.has("state") && (url.searchParams.has("code") || url.searchParams.has("error"))
  );
}

type Deliver = (href: string) => void | Promise<void>;

// Loaded only in the popup, so the grant code stays out of the reader's start-up.
const deliverWithSdk: Deliver = async (href) => {
  (await import("@mdbase-dev/sdk/app-grant")).deliverAppGrantCallback(href);
};

/** Hand the callback to the waiting tab, then close this window. False when it isn't one. */
export function completeAppGrantCallback(
  url: URL,
  close: () => void = () => window.close(),
  deliver: Deliver = deliverWithSdk,
): boolean {
  if (!isAppGrantCallback(url)) {
    return false;
  }
  void Promise.resolve()
    .then(() => deliver(url.href))
    // Close either way: the waiting tab times out by itself if nothing arrived.
    .catch(() => undefined)
    .finally(close);
  return true;
}
