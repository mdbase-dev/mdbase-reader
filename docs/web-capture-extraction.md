# Web capture extraction

New captures in Reader and the MV3 extension share `webCaptureImport` in
`packages/web-capture`. It loads the pinned `defuddle@0.19.5` browser core only
when saving, never `defuddle/full` or `defuddle/node`. The browser bundle is
self-contained; npm also installs CLI/optional dependencies, but those are not
part of either application's extractor chunk.

## Preserve the reading evidence

Defuddle runs synchronously on a clone of the captured document. Our scholarly
metadata, JSON-LD and publisher-tag pipeline still reads the untouched original;
publisher authors retain their existing precedence. Output remains HTML passed
through `prepareHtmlDocument`, with a separate unchanged archive.

We disable standardization, content-pattern removal, partial-selector removal,
hidden-element removal and small-image removal. The comparison found real losses
with the defaults: truncated Wikipedia sections, code figures and captions in
the Rust Book, arXiv tables/short summaries, and hidden sidenotes. These settings
prefer complete evidence and original citation/code/math structure over extra
cleanup. Exact-selector cleanup and content scoring remain enabled. Some
boilerplate and duplicate math representations can consequently survive.

As a last-resort safety check, an extraction with fewer than half the page's
words (at least 400 page words, excluding navigation, header/footer, scripts,
styles, templates and explicitly hidden elements) tries the separately lazy,
pinned Readability 0.6.0. It switches only if Readability recovers more than both
1.5 times the extracted words and 200 additional words. This is a truncation
heuristic, not proof that every passage survived, and does not detect small losses.

`capture.extractor` records `defuddle@0.19.5` or `mozilla-readability@0.6.0` on the
new source note. The field is optional for historical captures. There is no
backfill, opening-time extraction, or migration of existing `readable.html`:
replacing that text would invalidate its highlights.

## Network audit (0.19.5)

The installed browser-core sources were searched for `fetch`, XHR and other
network transports. All extractor HTTP calls are in these async paths:

| Extractor | Network paths                                                                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| X oEmbed  | FxTwitter API (including articles), then Twitter publish/oEmbed                                                                                         |
| Reddit    | old.reddit HTML, then the Reddit Atom feed (`/.rss`)                                                                                                    |
| YouTube   | InnerTube player (Android, iOS, web clients), next/chapters, caption-track XML URLs; async transcript-panel interaction can also initiate page requests |
| Bilibili  | view metadata, player WBI/v2 and v2 variants, subtitle-track URLs                                                                                       |
| C2 wiki   | `c2.com/wiki/remodel/pages/` JSON                                                                                                                       |

They are reachable through `parseAsync()` or `fetchAsyncVariables()`, neither of
which we call. We additionally set `useAsync: false` and supply a throwing fetch
override rather than letting any extractor use global fetch. The Node/CLI
`fetch.js` has direct fetch/proxy HTTP transports, but is not in the browser
entry point. No extractor XHR calls were found.

Tests spy on fetch/XHR for all five async-extractor families, including empty
local shells and inline YouTube caption data. Resource/script sanitization and
original-document immutability are also covered. A separate real Chromium check
observed zero external requests while extracting the 39-page comparison corpus,
the regression fixtures and empty X/Reddit/YouTube/Bilibili/C2 shells. Happy DOM's
iframe loading is disabled in the unit tests to model browsers' inert parsed
documents; Chromium also checked that generated embeds do not initiate requests.

When upgrading Defuddle, repeat the source audit and comparison rather than
assuming the version's network or cleanup behavior remains unchanged.
