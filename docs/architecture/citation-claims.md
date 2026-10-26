# Citation claims: field-level evidence for page citations

Status: claims, resolver and capture-save provenance implemented; snapshot replay and adapters
remain staged below. Extends [Citation metadata](citation-metadata.md), whose
decisions stand: the `csl` object on the source record is canonical, and inferred metadata is a
candidate, not a write.

## Problem

Each metadata source returns a whole citation, and the first one wins. `webArticleCitation`
takes `headline ?? name ?? og:title`; `citationForPage` spreads the DOI record over the page's
tags with `mergedCitation`. Once a citation exists, the evidence behind each value is gone, so
every fix is another precedence rule in another extractor.

Wikipedia shows the failure. Its JSON-LD says `"name": "Australia"` and
`"headline": "country"`, which is the Wikidata short description. The page has no
`og:site_name`, so the publisher is reused as the container. The saved citation reads:

> Contributors to Wikimedia projects. (2001, November 4). country. Wikimedia Foundation, Inc.
> Wikimedia Foundation, Inc.

The page's `<h1>`, `<title>` and JSON-LD `name` all say "Australia". The information to get
this right was on the page; the code had no way to weigh it.

### Evidence: page tags against Citoid

Nine pages, 2026-10-21. "Ours" is `extractScholarlyMetadata` on HTML fetched with curl.

| Page                    | Ours                                   | Citoid                                                                      | Better |
| ----------------------- | -------------------------------------- | --------------------------------------------------------------------------- | ------ |
| Wikipedia, Australia    | title "country", publisher twice, 2001 | encyclopedia article, "Australia", _Wikipedia_, revision date, `oldid` link | Citoid |
| GitHub repository       | none                                   | software, correct title                                                     | Citoid |
| MDN page                | none                                   | correct title, _MDN Web Docs_                                               | Citoid |
| New York Times article  | none (bot wall blocked our fetch)      | full citation, both authors                                                 | Citoid |
| Guardian article        | author "reporter"                      | author Associated Press                                                     | Citoid |
| ABC News article        | current headline                       | stale "Breaking: …" headline, no author                                     | ours   |
| BBC News article        | author Davies                          | no author                                                                   | ours   |
| The Verge, Ars Technica | correct                                | correct                                                                     | tie    |

Neither source is reliably better. Citoid took 1.7–4.8 seconds per lookup.

Two further bugs in our tag reading surfaced: the Guardian's JSON-LD author is
`"Guardian staff reporter"`, which `cslName` splits into the surname "reporter"; and
`container-title` falls back to the publisher's name.

## Decision

Sources report **claims**: one value for one field, with where it came from. A pure
**resolver** chooses each field from all claims and records why. The resolver's output is an
ordinary CSL item, so validation, citekeys, styles, export and the citation editor are
unchanged.

Claims are evidence, not a second citation model. Nothing reads a citation from them except
the resolver, and the stored `csl` always wins over them.

## Claims

```ts
interface Claim {
  readonly field: string; // CSL variable: "title", "author", "issued", "container-title", …
  readonly value: unknown; // already in CSL form
  readonly source: ClaimSource;
  readonly evidence?: string; // "json-ld headline", "<h1>", "meta og:title", "RIS export"
  readonly observedAt: string; // ISO time the value was seen
}

type ClaimSource =
  | { readonly kind: "registry"; readonly name: "doi.org" | "isbn" | "pubmed" }
  | { readonly kind: "site-adapter"; readonly name: string }
  | { readonly kind: "page"; readonly signal: "json-ld" | "highwire" | "open-graph" | "html" }
  | { readonly kind: "generic-remote"; readonly name: string }
  | { readonly kind: "parent" }
  | { readonly kind: "user" };
```

Extractors report every candidate they find, including the ones that will lose. Name lists are
one claim per list; the resolver may fill missing given names from another source's list when
the family names agree.

A Citoid result counts as `site-adapter` when its Zotero item type is specific
(`encyclopediaArticle`, `computerProgram`, `journalArticle`, `book`, …), since Zotero has no
generic translator that produces those types. A `webpage` or `newspaperArticle` result is what
Zotero's generic Embedded Metadata translator produces, and counts as `generic-remote`.

## Remote work identity

Remote authority applies to a **work**, not merely to a field. Before doi.org, Citoid or a
private Translation Server contributes claims, `remote-work-identity.ts` compares the whole
record with the local page-only resolution. The comparison context stays local; it is never
sent in requests. The resolver's scoring rules are unchanged.

- **Same:** DOI equality (case-insensitive, stripped of URL/`doi:` wrappers) always confirms
  identity, even if other metadata disagrees. Otherwise, matching arXiv identifiers, ISBNs
  (ignoring separators), or canonical/landing URLs confirm it. URL comparison ignores fragments
  and HTTP versus HTTPS, but retains paths, trailing slashes and queries, including editions.
  Known conflicting DOIs, arXiv IDs or ISBNs take precedence over a shared landing URL.
- **Related versions:** on an arXiv page the effective work DOI is the repository DOI derived
  from its arXiv ID, **not** an embedded published-work DOI. A different remote DOI or an
  explicitly journal/conference/chapter record is a mismatch, even with the preprint's title,
  authors or arXiv backlink. Equality with the repository DOI still confirms identity. The
  published DOI is not substituted or followed as a new identity; automatic lookup targets
  the repository DOI. We do not currently persist a separate related-publication DOI note.
- **Without strong identity:** titles are NFKD-normalized, case/accent/punctuation-insensitive
  Unicode word sets. A Dice overlap of at least 0.85 plus agreement on **one** of first-author
  family name, issued year or container confirms the work. Overlap below 0.35 is a mismatch.
  Missing titles, intermediate similarity, or a title without a bibliographic anchor are
  uncertain, not proof of a different work.
- **Mismatch:** drop the entire batch, including discovered identifiers, and report provider
  result `mismatch`. A rejected Citoid record cannot launch a DOI lookup. A rejected registry
  response can fall back to Citoid within the original deadline.
- **Uncertain:** keep claims but change their source to `generic-remote` (weight 40), including
  registry records normally weighted 80 and site-adapters normally weighted 60. Report
  `uncertain`; they may fill gaps or compete at ordinary page strength, not registry strength.
  Their DOI discoveries do not self-confirm the subsequent registry record: it is still checked
  against the original context. Only a confirmed same-work Citoid record can establish a new
  DOI identity for registry enrichment.

A DOI response's actual DOI is preserved rather than overwritten with the requested DOI;
only a missing DOI is filled from the request. Otherwise a defective response would manufacture
its own identity proof. Page previews publish mismatch/uncertainty diagnostics even when no
citation field changed. Explicit citation-update searches use only the typed URL/identifier;
refresh may supply its current citation as local comparison context. `onOutcome` exposes the
same diagnostics to citation-update callers.

Identity is not a cure for defective fields in the **same** work. In the 36-case replay,
XGBoost's remote wrong fields fall from six to one (publisher remains missing on the page).
The other remote regressions are deliberately retained: ACL's matching DOI has a defective
short title/year/pages/container; ONS's matching canonical URL has an incomplete title; RFC
has the same work at another institutional URL; Zenodo's matching DOI has a legacy record URL;
USENIX has an equivalent but differently formatted ISBN. Rejecting those as different works
would violate the strong-identity rule or lose legitimate enrichment. Field/representation
repairs remain separate resolver/provider work. Page wrong-field total stays 89; remote falls
from 65 to 60, with no case regressing.

## Resolver

For each field, the resolver groups claims whose values match after normalisation, scores each
group, and chooses the highest:

1. **Source strength.** `user` (100) > `parent` (90, inherited fields only) > `registry` (80) >
   `site-adapter` (60) > `page` and `generic-remote` (40). This is a starting score, not an
   absolute order; user decisions remain pinned regardless of corroboration.
2. **Corroboration.** Independent signals that agree add weight. Titles are compared ignoring
   case and surrounding whitespace. Only HTML `<title>`, `og:title` and `twitter:title` offer
   site-suffix-stripped candidates alongside the full title. Work headings and structured or
   remote titles are never split. Derived candidates retain the original signal's identity;
   generic remote metadata repeating a document title is not independent corroboration.
3. **Field rules,** kept here rather than in extractors: a publisher's name is not evidence for
   `container-title`; role phrases such as "staff reporter" or "editorial board" are not
   personal names. A page title suffix supplies container evidence only with container, host or
   repeated-title support. A generic `webpage` type is fallback evidence, not a vote against a
   positively identified work type. An ambiguous partial date stays at its actual precision
   rather than endorsing several conflicting full dates; rejected values credit their supplier.
   DOI-resolver URLs are weaker than explicit landing-page URLs. Equivalent publisher legal-name
   spellings use the page's imprint; a conflicting registry member name yields only to an imprint
   corroborated by independent page vocabularies. Challenge pages supply no work claims.
4. **Freshness.** Score wins first; only exact ties use observation time. `citationForPage`
   dates provider claims to the page snapshot, not the response's arrival. A later Citoid fetch
   can be cached and does not prove newer content. Without a snapshot, the lookup's start time
   is the best available observation time; callers may supply an independently known content
   observation time.

Scalar values and ordered name lists use normalized equivalence buckets; partial dates use a
precision/prefix compatibility index so ambiguous years do not merge conflicting full dates.
Page extraction scopes JSON-LD to the page/canonical identity and explicit `mainEntity` links,
not recommendation or ItemList entries. Unscoped graphs with more than eight works are ignored.
Extraction limits JSON-LD to 32 scripts, 2 million characters and 4,096 graph entries; exceeding
those limits discards the graph rather than selecting its first work. Metadata is bounded to
512 tags, 128 values per array and 128 claims per field, with HTML fallback evidence reserved.
`webCaptureImport` shares its parsed document and `ClaimBatch` with
`scholarlyMetadataFromClaims` instead of extracting the snapshot twice.

Start with fixed ranks and a corroboration bonus. Add weights only when a corpus page needs them.

Applied to Wikipedia, "Australia" is backed by `name`, `<h1>`, `og:title` and Citoid, while
"country" is backed by nothing. The resolver chooses "Australia" even without Citoid. The live
ABC headline beats Citoid's older copy on corroboration; the BBC author fills Citoid's gap.

The resolver returns the chosen CSL item, provenance for each field, and **suggestions**:
values from a stronger source that differ from an existing field.

## Provenance and external edits

The `csl` frontmatter is edited outside Reader, often in text editors, and is read by other
CSL tools. So it stays pure CSL JSON, and provenance lives under a separate frontmatter key:

```yaml
csl:
  title: Australia
  container-title: Wikipedia
csl-provenance:
  title:
    value: Australia
    source: site-adapter:Wikipedia
    agreed: [json-ld name, h1, og:title]
    rejected: [{ value: country, from: json-ld headline }]
```

Each entry pins the value it explains. When Reader reads a record:

- **Value matches the pinned value:** the provenance is current. The panel shows the source and
  offers rejected values.
- **Value differs:** it was edited outside Reader. It becomes a `user` claim and the panel says
  "edited manually".
- **Field is gone but provenance pins a value:** it was deliberately removed. That is recorded
  as a user decision, and later lookups do not restore it.
- **No provenance:** every field is the user's, as for hand-written or imported citations.

Capture saves write the resolved citation and its matching field provenance together. Reader and
extension generate a collection-unique `id` (citekey) locally, so capture provenance never
includes `id`. Fields edited in the extension draft lose their captured provenance; untouched
fields keep it. Absent or mismatched values are not given captured provenance. New-source identifier and citation-only adds prefer gateway field claims where supported.
Candidate-only providers are converted to claims using their provider and retrieval time:
doi.org (including arXiv repository DOIs), ISBN and PubMed registries retain registry rank;
other services remain generic remote evidence. PDF metadata claims accompany registry claims.
The accepted candidate values and collection-generated citekeys are unchanged. Gateway identity
rejections and uncertainty never regain registry strength through a candidate summary.

Malformed provenance is ignored field by field. Deleting `csl-provenance` loses only the
explanations. Entries keep the chosen source and at most two rejected values; full evidence is
stored with the snapshot.

Lookups on an existing citation follow the accepted boundary: they may propose filling empty,
not-removed fields, and present every change to an existing value as a suggestion that needs an
explicit save.

To check: whether the mdbase source type accepts an undeclared `csl-provenance` key, or whether
it must be declared in the type schema.

## Parent records

`parentCitationClaims(parentCsl, parentProvenance, observedAt, options?)` supplies pure claims
from the **immediate parent** selected by the caller. It does not follow part-of links, read a
collection, or recursively inherit from a grandparent. A parent that is itself a volume/part
supplies its own title and volume/series metadata, not its `container-title` as the chapter's
container. The caller supplies the chapter title and sets `type: chapter`; neither type nor
chapter identity is inferred by this helper.

| Parent CSL field                                                         | Chapter CSL field                          |
| ------------------------------------------------------------------------ | ------------------------------------------ |
| `title`, `title-short`                                                   | `container-title`, `container-title-short` |
| `editor`                                                                 | `editor`                                   |
| `author`                                                                 | `container-author`                         |
| `publisher`, `publisher-place`, `issued`, `ISBN`, `edition`, `volume`    | Same field                                 |
| `collection-title`, `collection-number`, `language`, `number-of-volumes` | Same field                                 |

A book's author is **never** promoted to editor or chapter author, even when the book has no
editors or the chapter has no author. CSL's `container-author` preserves the actual role and
can coexist with `editor`; `options.includeContainerAuthor: false` can omit it. Chapter `title`,
`author`, `page`, `DOI`, `URL`, `abstract`, `chapter-number`, `id` and `type` are never inherited.
Empty, absent and invalid mapped values emit nothing. Parent CSL is canonical: parent provenance
is accepted but not replayed, so external edits are inherited and removed values stay absent.
It cannot multiply the parent's votes or transfer its own user/registry rank to the chapter.

The fixed source label is `parent`, with only the mapped-from CSL variable as evidence (for
example `parent title`). No source ID, path, book title, author name or upstream provider label
enters these labels. With one immediate parent per call, identity is unnecessary. Reader
presents this as **From the book**, and local quality summaries count a fixed `parent` category.

Inherited claims start at **90** because the user-selected parent is curated container metadata:
a conflicting chapter DOI record's `container-title` (80) loses to the parent, as do page,
generic-remote and site-adapter claims. This is still score-based, not a veto: sufficient
independent corroboration can outweigh 90. Chapter-specific evidence is untouched because
parent claims cannot target chapter-specific fields, and chapter user edits always stay pinned.
Parent publisher claims also retain their rank/attribution across the page-imprint heuristics.

Creation composes `resolveCitation({ claims: [...pageOrRemoteClaims, ...parentClaims] })`.
Refresh uses `resolveCitation({ existing: { citation, provenance }, claims: parentClaims })`:
the saved CSL is unchanged; fills and changes are suggestions until explicitly accepted. A
fresh parent claim replaces the old explained parent vote and its historical corroboration
for that field, otherwise old agreement could prevent any book correction from surfacing.
Edited, unexplained manual and deliberately removed chapter values remain user-owned.
Dismissals (`rejected` entries from `user`) suppress the same proposed values on refresh,
while different later values can still be suggested. Missing parent fields do not imply a
chapter deletion: this helper emits no removal claims.

## Where the code runs

One extraction core runs in every host. Each host supplies capture, a request broker and
persistence.

| Piece            | Responsibility                                                                         | Runs in                                                                            |
| ---------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Snapshot capture | URL, canonical URL, HTML or PDF bytes, retrieval time                                  | Extension content script (`page-capture.ts`); Reader `/api/capture` Pages Function |
| Extraction core  | Snapshot in, claims out; no network or storage access of its own                       | Same package in the extension, the Reader tab (a Web Worker), Node tests           |
| Request broker   | Fetches resources adapters ask for, records each response into the snapshot            | Host-specific                                                                      |
| Remote providers | doi.org, Citoid or a private Translation Server, ISBN and PubMed                       | Host, calling the services directly (all allow cross-origin requests)              |
| Resolver         | Claims plus current `csl` and provenance in; citation, provenance and suggestions out  | Wherever the UI is; it reruns as claims arrive                                     |
| Persistence      | `csl` and `csl-provenance` on the record; snapshot and claim log with the page archive | Host, through Connect                                                              |

The core parses HTML with a bundled parser (linkedom or parse5), not `DOMParser`, which is
missing from extension service workers, Web Workers and Cloudflare Workers. The same snapshot
then produces the same claims everywhere, which snapshot tests depend on.

### In the extension

1. The content script freezes the page, as it does now.
2. In the side panel or an offscreen document, the core runs generic extractors and matching
   adapters. The resolver shows a first citation within milliseconds.
3. If claims include a DOI, doi.org adds registry claims first. Only a failed registry lookup
   (including not-found, timeout, rate-limit, block, identity mismatch or uncertainty) falls back to Citoid. Without a DOI,
   Citoid adds claims for the URL when enabled. The resolver reruns each time. The draft retains
   its last automatically applied title and an explicit edit marker across panel restores and
   lookup restarts, so only a genuinely edited title is protected.
4. New identifiers can trigger further lookups, at most two rounds. `PageCitationOptions.deadlineMs`
   bounds all remote work together, including queueing: 8 seconds by default, with each DOI
   lookup capped at 3 seconds and each Citoid lookup capped at its remaining budget. Reader URL
   adds use a 6-second overall citation budget. Page-only previews are published before any
   remote work. The extension keeps that preview visible with a quiet pending status until
   lookups settle; saving pins the latest available citation, provenance and source metadata
   together immediately before import, without waiting for outstanding lookups or applying
   later results to an already saved source.

The broker fetches only from the page's own site, using the optional host permission for that
origin, so requests carry the user's cookies. This covers exports such as RIS without becoming a
general fetcher.

### In the Reader

`/api/capture` fetches and freezes the page with its existing public-address checks; it does not
extract. The core and resolver run in the tab. Adapter requests go back through the server,
restricted to the page's site. When the server fetch fails, only remote providers produce
claims, which improves today's citation-only path.

### Offline

Stored snapshots let the core run again with no network: when adapters improve, on a source
being opened, or as a batch over a collection. Changes appear as suggestions. CI runs the same
core in Node against the snapshot corpus.

## Remote providers

Citoid is Wikimedia's hosted Zotero Translation Server. Its 2026 limits for unauthenticated
browser requests are 200 per minute per user, with HTTP 429 and `Retry-After` beyond that, and
Wikimedia asks for no more than three concurrent requests. One lookup per new page without a
DOI is well within that. Bulk work, such as re-citing a library, must queue with at most three
in flight and honour `Retry-After`. A 429, timeout or block falls back to the page's claims
without an error.

A background Citoid lookup sends the page URL to Wikimedia. Reader URL adds already send it to
`/api/capture`; the extension requires an explicit, default-off setting before automatic Citoid
lookups. Automatic extension lookups accept only HTTP(S) URLs without credentials, local or
intranet host suffixes, single-label hosts, or IP literals (even public IP literals are skipped
conservatively). Fragments are removed. URLs with obvious secret-bearing query parameters
(`token`, `key`, `sig`, `signature`, `auth`, `session`, `code`, `password`, and common compound
forms such as `access_token` and `apiKey`) are skipped, not rewritten: removing a signature
could change the resource being cited. This is a URL disclosure filter, not DNS validation;
Reader's existing server-side public-address validation is unchanged. PDF tabs skip Citoid
entirely, since a generic webpage result is not evidence for replacing their filename title;
DOI/arXiv registry lookup remains available.

The accepted plan for a private Translation Server behind an mdbase service fits as a drop-in
provider through `CitationLookupOptions.citoidEndpoint`. Translation Server cannot run in a
Worker, since Workers forbid `eval`; it needs a Container. A server of our own does not get past
bot walls any more than Citoid does. Record outcomes (success, 429, not found, blocked, timeout)
in diagnostics before deciding to build it.

## Adapters, later

Most site translators read tags with overrides, find an identifier, call a site export, or pick
fields with selectors. Those can be **declarative adapters**: a URL pattern plus rules mapping
selectors, JSON paths or an export template to fields, run by a small interpreter in the core.
Being data, they can be updated without a release, including under Manifest V3's ban on
downloaded code.

Adapters that need code run in QuickJS compiled to WebAssembly. Inside the sandbox they get
read-only queries over the parsed snapshot and `request(url)` through the broker, and nothing
else. WebAssembly runs where `eval` is banned, including Workers and extension pages. Providing
a DOM inside the sandbox, or a narrow query interface instead, is the main cost.

Zotero's translation engine and translators are AGPL-3.0, as is the Zotero Connector. Bundling
them in the extension or serving them from Reader makes that a combined work under the AGPL, and
the repository has no LICENSE yet. Until that is decided, Zotero translators are reached only
through Citoid or a separate Translation Server.

## Rollout

1. **Claims and resolver** in `packages/web-capture`. Generic extractors, doi.org and Citoid
   emit claims; `citationForPage` becomes the resolver and still returns a CSL item. Fix the
   title, container and role-name bugs as resolver rules. Tests come from the corpus pages above.
2. **Provenance** under `csl-provenance`, with external-edit detection and suggestions in the
   citation panel.
3. **Snapshots and claim logs** stored with the page archive, plus offline re-runs.
4. **Diagnostics** for provider outcomes and for the fields users correct.
5. **Declarative adapters** for the sites users cite most, then the sandbox, if diagnostics show
   the need.

## Related defect

`updateCitation` replaces the whole `csl` object without a revision check, by design, so that
unrelated writes such as reading position do not block saves. An external edit to `csl` made
while the citation editor is open is overwritten by Reader's next save. The fix is to check that
`csl` itself is unchanged since it was loaded and, if not, treat the outside values as user
claims. Step 2 depends on it.

## Open questions

- How loosely to match names: "Peters" against "Jay Peters", initials, particles.
- Whether a `user` claim stays pinned when the user later accepts a suggestion for the same
  field, or is replaced by the accepted source's claim.
- Where snapshots and claim logs live in a collection, and how long they are kept.
- Whether the extension's automatic Citoid lookup is on by default.

## Reader review behaviour

The citation editor's **Field sources** disclosure reports the current field statuses, with
agreed evidence and rejected alternatives nested beneath explained fields. Applying an
alternative is a manual draft edit. **Find citation details** looks up an explicit identifier
on its own; an explicit URL adds Citoid claims for that URL and registry claims for its DOI.
An empty query or `refresh` uses the current source URL and DOI instead. It never combines a
typed identifier with the current citation’s unrelated identifiers. Results resolve against
the current draft and its provenance, and are discarded when that draft or the selected source
changes. A non-object or unparsable CSL draft cannot accept suggestions. Accept, Dismiss, and
Accept all never save automatically. Manual values and removed fields remain protected. ISBN
and title-only lookups can still use the gateway’s existing candidate lookup, converted to
claims for the same review boundary.

On save, untouched provenance entries are kept. Accepted suggestions pin the proposed value,
use `claimSourceLabel` for their source, and retain their evidence in `agreed`. Typed values
(including rejected alternatives) receive `source: user`, without old resolver alternatives. Clearing a
field retains its previous pinned entry, or pins its former value as `user` if it had no
entry. This removal marker is intentionally kept so subsequent lookups cannot refill it.

### Remembered dismissals

Dismiss is a draft provenance edit, persisted only by **Save**. It reuses the existing
`rejected` list: `{ value: <proposed CSL value>, from: "user" }` denotes an explicit dismissal,
not a resolver-ranked alternative. The list stays bounded to two values per field, with user
dismissals ahead of machine alternatives and newest decisions first. A third distinct dismissal
evicts the oldest. Older readers can parse the unchanged shape without interpreting the user
rejection as a resolver rule; records without user rejections behave as before.

For an absent field, a dismissal-only entry uses `{ rejected: [...] }`, without `value` or
`source`. It pins no chosen value and is not a deliberate removal: only the dismissed value
is blocked, so a different fill can still be proposed. Older parsers ignore these entries
because they require both `value` and `source`. An entry pinning a former value still protects
a deliberate removal. Existing empty strings, arrays and explicit nulls retain their actual
baseline value. No extra frontmatter key or local storage is involved.

Suppression uses `claimValuesMatch` from `claim-matching.ts`, including normalized titles,
publishers, names and compatible dates, regardless of which provider proposes the value.
Manual edits, accepts, capture filtering and Connect provenance rewrites preserve user
rejections. Guarded Connect saves merge them from the freshly read record on every retry,
including provenance-only concurrent changes; other stale explanations are not restored.

Every editor save compares the loaded CSL, including an explicitly absent or malformed CSL
baseline. A conflict preserves the draft. **Use their version** reloads the reported CSL and
its current, leniently parsed provenance without writing. **Keep mine** retries against that
exact reported CSL, so another intervening edit still conflicts. Keep mine replaces the other
version entirely with the user’s draft and its provenance, including removal markers: it does
not merge the other version’s pinned removals.

The library view menu's **Citation quality · local only** section computes fixed category
counts from indexed source CSL and provenance. It performs no requests and retains no
identifiers, field names, values, provider names, or event history. Edited counts describe
current mismatches with recorded provenance, not lifetime corrections; a manual value saved as
`user` no longer attributes an edit to its former provider. Partial library indexes are labelled.
Aggregate acceptance/dismissal history is not retained. Archived-page re-extraction is deferred: the
editor has no local snapshot/document handle, and does not fetch an archive merely to check
citation updates.
