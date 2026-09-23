/**
 * Chrome host permissions let extension fetches carry a site's cookies even with
 * the default `same-origin` policy. Portable grants use signed SDK authorization,
 * never the user's portal cookie. Keep account cookies out of this realm's I/O.
 * This adapter is installed only in the extension, not Reader or the website.
 */
export function credentiallessFetch(fetcher: typeof fetch): typeof fetch {
  return (input, init) => fetcher(input, { ...init, credentials: "omit" });
}
