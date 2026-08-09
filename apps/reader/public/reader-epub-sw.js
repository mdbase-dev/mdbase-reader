/* global URL, Response, caches, self */

const CACHE_NAME = "mdbase-reader-epub-v1";
const RESOURCE_PREFIX = "/__mdbase-reader/epub/";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  if (event.data === "claim-reader-clients") {
    event.waitUntil(self.clients.claim());
  }
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    url.origin !== self.location.origin ||
    !url.pathname.startsWith(RESOURCE_PREFIX) ||
    !["GET", "HEAD"].includes(event.request.method)
  ) {
    return;
  }
  event.respondWith(publicationResponse(event.request, url));
});

async function publicationResponse(request, url) {
  url.search = "";
  url.hash = "";
  const cached = await caches.open(CACHE_NAME).then((cache) => cache.match(url.href));
  if (!cached) {
    return new Response("EPUB resource is no longer available.", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  if (request.method === "HEAD") {
    return new Response(null, { status: cached.status, headers: cached.headers });
  }
  return cached;
}
