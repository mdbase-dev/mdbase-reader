# Citation corpus expansion

See [capture format and safety rules](../README.md#citation-replay-corpus).

Fifteen cases added to the original 21, captured on 2026-10-23 against
`feat/citation-claims` HEAD `9128f240fb905807949f035d7ee0aae77f6a07cf`, on
`t3/corpus-expand`. No extraction, provider or resolver implementation changes.

Each `expected.json` is hand-catalogued from the actual work, its publisher's
citation, or an independently checked DOI record. Each `meta.json` explains the
authority and edition/date decisions, capture status, remote request and replay
baseline. Expectations were written before scoring the extractor. The table
below records the initial ratchet; the executable `stillWrong` table is the
maintained source of truth after future fixes.

## Sources and initial wrong fields

Field names are literal CSL keys; `—` means all asserted fields match. Remote
means page claims plus the recorded, actually discoverable DOI lookup (if any)
and Citoid response, not a synthetic complete bibliography import.

| Case / source URL                                                                                                     | Page-only wrong fields                                          | With recorded remotes                                   |
| --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------- |
| [acl-bleu](https://aclanthology.org/P02-1040/)                                                                        | container-title, publisher                                      | title, issued, container-title, page                    |
| [arxiv-adam](https://arxiv.org/abs/1412.6980)                                                                         | publisher                                                       | —                                                       |
| [arxiv-xgboost](https://arxiv.org/abs/1603.02754)                                                                     | publisher                                                       | type, title, issued, publisher, DOI, URL                |
| [blog-web-bloat](https://danluu.com/web-bloat/)                                                                       | type, author, issued                                            | type, author, issued                                    |
| [book-gutenberg](https://www.gutenberg.org/ebooks/1342)                                                               | type, title, author, issued, publisher                          | publisher                                               |
| [legislation-data-protection](https://www.legislation.gov.uk/ukpga/2018/12/contents/enacted)                          | type, issued, number, URL                                       | type, issued, number, URL                               |
| [nonenglish-cnrs-medieval](https://lejournal.cnrs.fr/articles/et-le-moyen-age-crea-lanimal)                           | type, author, issued                                            | type, author, issued                                    |
| [ons-inflation](https://www.ons.gov.uk/economy/inflationandpriceindices/bulletins/consumerpriceinflation/january2024) | type, author                                                    | type, title, author                                     |
| [patent-pagerank](https://patents.google.com/patent/US6285999B1/en)                                                   | type, title, author, issued, number                             | issued                                                  |
| [podcast-changelog](https://changelog.com/podcast/500)                                                                | type, title, author, issued, container-title, publisher, number | type, title, author, container-title, publisher, number |
| [repec-working-paper](https://ideas.repec.org/p/nbr/nberwo/11416.html)                                                | type, author, issued, publisher, DOI, URL                       | type, publisher, DOI, URL                               |
| [rfc-http](https://www.rfc-editor.org/rfc/rfc9110.html)                                                               | type, title, editor, issued, publisher, number, DOI             | editor, publisher, number, URL                          |
| [substack-cyborgs](https://www.oneusefulthing.org/p/centaurs-and-cyborgs-on-the-jagged)                               | type, container-title                                           | type, container-title                                   |
| [usenix-raft](https://www.usenix.org/conference/atc14/technical-sessions/presentation/ongaro)                         | issued, publisher                                               | issued, publisher, ISBN                                 |
| [zenodo-urban-sound](https://zenodo.org/records/1203745)                                                              | type, issued, publisher, version                                | version, URL                                            |

## Patterns to target next

Across the new cases there are 54 wrong asserted fields page-only and 46 with
remotes. The most common are:

- **Work type:** 11/15 page-only, 8/15 remote. Blog/newsletter, institutional
  bulletin, legislation, patent and podcast types are not reliably represented
  by generic website, NewsArticle or ScholarlyArticle markup. Zenodo uses an
  absolute schema type URL, not the short `Dataset` token.
- **Publication date and precision:** 10/15 page-only, 7/15 remote. Filing,
  grant, release, recording, publication and revision dates are different;
  year-only metadata also loses months/days established by the work itself.
- **Publisher:** 9/15 page-only, 6/15 remote. Repository identity, conference
  publisher and ebook publisher are often missing or confused with site names.
- **Creators and roles:** author wrong in 7/15 page-only and 4/15 remote;
  editors wrong in one case in each mode. ONS's official institutional author
  is not its contact person; podcast hosts are not the guest; RFC editors are
  not automatically authors; `@CNRS` is not Marina Julienne.
- **Remote authority can regress correct page evidence:** XGBoost's embedded
  DOI identifies a _related later conference publication_, not the preprint.
  ACL's actual DOI response has year 2001, title `BLEU` plus a separate subtitle,
  and only the first page, whereas ACL's own citation gives July 2002 and the
  complete title/pages. ONS's generic remote title drops the release period.
  USENIX remote evidence also changes an initially correct ISBN representation.
- **Identity/edition URLs:** five remote failures. Preserve the requested
  enacted legislation edition and fixed repository URLs rather than collapsing
  them to a different canonical edition, a DOI URL or a legacy record path.

## Capture evidence and limitations

All accepted pages were HTTP 200 with actual work metadata/content, not bot
walls. HTML is an original reduced reproduction, never the saved article body.
Each fixture is below 20 KB after formatting; most are only a few KB. The
metadata-free Dan Luu post intentionally has only its real title element, no
invented headline/byline/date. Its publication date is checked in the author's
linked feed, not inferred by the extractor. Gutenberg's Book scope, bibliographic
microdata and contradictory release/update RDFa values are retained.

Full HTML, unabridged provider responses and verification pages remain ignored
under `.scratch/corpus/expand/<slug>/<download-kind>/`. Every download used its
own newly created empty directory. Helpers were outside those directories, ran
with `python3 -I`, parsed content as data and executed none of it. Requests were
sequential with a browser-like User-Agent, at least one second between Wikimedia
requests, `Api-User-Agent: mdbase-reader-corpus` for Citoid and the CSL Accept
header for DOI negotiation. Initial Citoid 429 responses for the final four
cases were retained privately; retries after Retry-After elapsed succeeded,
and the fixtures record those later 200 responses. Zenodo Citoid 404 and
legislation Citoid 400 are recorded unchanged.

The four new `doi.json` files are the DOI responses the page can actually
discover: ACL, Adam, XGBoost and UrbanSound8K. NBER and RFC DOI responses were
also downloaded to verify ground truth but **not** installed as replay responses:
the page does not expose them in discoverable metadata. arXiv now assigns a
repository DOI to every paper; Adam therefore represents _no external
publication DOI_, not a falsely stripped or fictitious DOI-free arXiv page.
XGBoost explicitly contrasts a repository DOI with a related publication DOI.

## Skipped candidates

No blocked or JavaScript-only candidate was turned into an invented successful
capture, and no login/paywall bypass was attempted:

- [PubMed 27775715](https://pubmed.ncbi.nlm.nih.gov/27775715/): HTTP 203 cookie
  challenge, not an abstract.
- [bioRxiv candidate](https://www.biorxiv.org/content/10.1101/2020.04.19.049684v1):
  redirected to an empty `/node/` page; no verifiable work to reproduce.
- [JSTOR stable page](https://www.jstor.org/stable/2118408): HTTP 200 JavaScript
  client challenge, not an article.
- [Medium candidate](https://medium.com/towards-data-science/the-illustrated-transformer-d8a42e1d1c9):
  HTTP 403.
- [FT candidate](https://www.ft.com/content/7f178e5a-924b-11e7-a9e6-11d2f0ebb7f0)
  and [The Atlantic's As We May Think](https://www.theatlantic.com/magazine/archive/1945/07/as-we-may-think/303881/):
  HTTP 403; no new soft-paywall case accepted.
- [OpenStax statistics](https://openstax.org/details/books/statistics): JavaScript
  application shell without the work's bibliographic record. A
  [Princeton publisher candidate](https://press.princeton.edu/books/hardcover/9780691183562/the-great-mental-models)
  returned HTTP 403. Used Gutenberg's accessible ebook edition instead.
- Initial [Dan Luu URL](https://danluu.com/slow-web/),
  [USENIX Borg URL](https://www.usenix.org/conference/eurosys15/technical-sessions/presentation/verma),
  [INSEE URL](https://www.insee.fr/fr/statistiques/7721183) and
  [BnF URL](https://www.bnf.fr/fr/une-histoire-de-la-bibliotheque-nationale-de-france)
  returned 404. An initial
  [CNRS blob URL](https://lejournal.cnrs.fr/articles/le-blob-une-cellule-qui-apprend)
  returned an empty CMS page; selected a real article from CNRS's own feed.
- [Zenodo 3509134](https://zenodo.org/records/3509134) redirected to a moving
  software concept's latest release, not a fixed dataset. Used the fixed
  UrbanSound8K version instead.
