# Reader native publisher (source only)

**Co072350 resumed current intake:** actual SDK merge
`eaa4e697fc1198f32fc3714f377342a24c56d985` / tree
`71ddecbca5dd54b5153d6bcd500cc89ce189474e`, sole CI39383342511/a1 SUCCESS.
NX-TNAPP's ONE replacement STAGE original is CLOSED/READY; no producer rerun,
SDK patch/repack/reauth or new signing authority. The prior c0bc HOLD was obeyed:
no c0bc product build started. Its archive/packet remain immutable historical
custody, not transferred qualification. Parent custody readback and independent
Reader byte checks precede the fresh full check and ONE actual staging web plus
extension consumer build. Live publication/admission remain separate future work.

This is a separate manual path in the registered `deploy-reader.yml`. Leaving
`source_sha` blank preserves the existing CI/main deployment jobs. A nonblank
value requires a full lowercase 40-hex SHA, `workflow_dispatch`, the literal
`release/native-staging` or `release/native-production` branch, the same event
SHA, the exact fetched release HEAD, a clean checkout and Reader native ancestry
from `effb511e6b6bac9c5ba90ca0300ca5788cd25d5f`. Immediately before the ONE upload,
the uploader rechecks the full artifact inventory and CURRENT remote ref HEAD;
ancestry alone never authorizes upload. No Git main merge is needed.

## Authentication and original custody

NXtrust/TNAPP authenticate the full chain once, off CI/private Ops. These scripts
bind original bytes to that accepted handoff; they do not repeat authentication,
create trust, verify freshness/expiry, invent signed receipts or confer admission.
The unsigned SDK build receipt is a context/verifier binding, not authentication.

Four independent protected target-environment variables are required by the live
CLI, without candidate/repository fallback:

- `NATIVE_SDK_SHA256`: original SDK tgz.
- `NATIVE_UI_SHA256`: this app's ORIGINAL UIb2 tgz, never another app's UIfe default.
- `NATIVE_PROTOCOL_SHA256`: original direct protocol129-c280 tgz.
- `NATIVE_TRUST_ASSET_SHA256`: FULL RAW signed target asset, not module, context,
  receipt, native-WASM or archive digest.

Current staging input is SDK `15eb64b5…` (4461608B), independently pinned fresh
public facts `d54aef71…` (4746B), unchanged Reader UIb2 `8f785294…`, direct protocol
`cd1e1523…` and raw asset `67e11764…`. Facts are pinned BEFORE JSON parsing; no old
d313/new-archive mixture is accepted. `reader-approved-intake.mjs` contains data/
local expectations ONLY; the live publisher never uses them as environment authority.
Parent separately updates/audits ONLY the existing Stage SDK hash variable; source
and local checks do not claim that Ops readback occurred.

The new original archive basename is `sdk-dev-eaa4e697-staging.tgz`. Its original
producer-layout packet is at
`packages/connect/vendor/native-release/staging-eaa4e697/`; the OLD c0bc archive
and `native-release/staging/` packet are retained byte-unchanged. New packet:

- `artifact/artifact-facts.public.json`, `artifact/members.json`,
  `artifact/provenance.json`;
- `sdk-build-receipt.json`;
- `verified-staging/next-trust/staging-context.json` and `staging.json`;
- the four original proof JSONs at `verified-staging/`.

The canonical member sidecar has tar order; comparisons sort copies, never
rewrite its bytes. `facts.dependencies[].file` is SDK-relative `vendor/<original
protocol>.tgz`, not an app-relative alias. All bundled protocol members and that
original vendor archive are checked. Native producer `mdbase-dev/mdbase-next`
725d72b2 is distinct from authenticated Connect f45df459/beta134. Verifier 0e44,
module 544350, context 15e0 and receipt d7ab retain their separate meanings.

Source gates check the frozen lock's pins and SRI, original archive/member data,
provenance, context, proofs, receipt, trust-module literal, native/SQLite bytes,
exact staging CP/log and independent approved source facts. Before SDK execution,
ALL original SDK/UI/protocol members must match across web, extension, Connect
and UI peers. No unknown executable or symlink is ignored. The unchanged legacy729
alias has its own frozen original SHA/SRI and ALL-member gate; it is NOT
authenticated staging trust. Its package/file/pin remain unchanged.

**Co064253 installer policy:** the initial genuine RED refused the SDK's generated
`node_modules/.bin/yaml`. Reader now independently verifies its OWN pinned AND
actual PNPM10.7.0 POSIX templates, not Writer's different tool version. Original
SDK896/UI81/protocol67 files still ALL match. The SDK and direct protocol each
have one separately counted, regular executable YAML shim; BOTH exact program,
NODE_PATH branches and targets must match. All 233 original bundled YAML files
match; the direct protocol's external YAML copy additionally matches EVERY one of
those original files, with exact version/location/target resolution. Any changed
original, unknown extra, changed shim, symlink or other manager/template refuses.
No blanket `.bin` ignore, deletion or shim execution occurs. Installer evidence
records original counts and total installed counts separately, is immutable-
artifact digest-bound, and is NOT SDK authentication or product qualification.

Production has no accepted target archive/packet. It refuses; staging is never
retargeted to production or LAB. Old vendor archives/dead legacy files remain.

## Isolation, artifacts and receipts

1. An input-only protected-environment job exports the four PUBLIC expected
   hashes and PUBLIC staging SPKI build input. No checkout, dependency execution
   or Cloudflare credentials are present there. A SAFE input-failure-only receipt
   exists before variable validation; failure never emits qualified artifact outputs.
2. The build job has NO environment or Cloudflare secrets. It verifies originals,
   installs frozen with `--ignore-scripts --ignore-pnpmfile`, verifies installed
   members, then runs checks. It builds actual staging web + unpacked extension
   once and precompiles the Reader capture Worker using a separate minimal
   integrity-locked official Wrangler4.114.0 install. No SDK/native producer build.
3. A minimal SAFE public **build-failure-only** receipt is initialized BEFORE
   checkout/install/intake. A failed build retains it in a separate artifact, not
   the qualified artifact ID/digest outputs. The protected upload job stays
   skipped. Failed intake is never converted into upload authority.
4. The approved build artifact binds repository/run/attempt/event/SHA/tree/target,
   plan, separate installer evidence, complete final web/extension inventories
   and extension ZIP digest.
   It includes final offline-shell, generated workers, `.well-known`, dotfiles,
   underscore files, JS/maps/native/SQLite/trust assets. The actual SDK defaults
   embed JSON in `mdbase-shell-sw.js`; there is NO `offline-assets.json` sidecar
   requirement. A strict no-eval canonical parser validates the cache version,
   sorted unique safe paths and EVERY listed hash against the independently
   reasserted FULL final inventory, plus exact original-SDK-derived runtime and
   registration bytes. The cache subset intentionally omits hidden/underscore/
   map files; the full inventory/served-byte checks never omit them. Tn's 58-cache
   assets/69-final-files count is NOT a Reader count or transferred proof; Reader
   counts are measured only from its actual build. Nothing is uploaded from
   extension/ to Pages, and no Web Store publication occurs.
5. The protected uploader installs NO app dependencies, runs NO app build/hooks
   and executes NO project scripts from an artifact. Trusted source code plus an
   isolated minimal integrity-locked Wrangler4.114.0 install are the only tools.
   Its isolated SOURCE-derived cwd config prevents artifact workspace/config
   discovery; the precompiled Worker uses `--no-bundle`.
6. Job-scoped `contents: read` and `actions: read` allow immutable Actions
   metadata/download checks. Server/action-output/download ZIP digests, repository,
   run, attempt, event, source, tree, target, plan and exact path sets are bound.
   Downloads/extraction are bounded, link-free and data-only. Every fetched
   `before`, `run`, `after`, `runAfter` response is projected to safe fields and
   checkpointed immediately BEFORE validation or another lookup. A refusal or
   lookup error preserves the latest response and safe stage/reason. Numeric HTTP
   status and bounded PUBLIC body projection/byte count/digest persist BEFORE HTTP
   status refusal, including 403/404/429 in ALL four stages. Only known public
   GitHub error text/canonical documentation URLs are retained; non-JSON/opaque
   bodies are identified by bounded length/hash and safely omitted. Never tokens,
   SAS URLs, response headers, opaque exceptions, arbitrary payloads or context dumps.
7. The complete artifact is made read-only and reasserted immediately before the
   LAST ref check and ONE web-only upload. Actual API deployment UUID capture
   must SUCCEED before served verification. A URL prefix is not a UUID.
8. Bounded, credential-omitting same-origin GETs compare ALL static served bytes.
   `.nojekyll`, if present, IS a served byte GET, not an omitted control. Unknown
   controls fail closed. Source-bound `_routes.json` and `_redirects`, scoped
   successful deployment/project metadata, exact client-route bytes, capture
   GET-denial bytes/headers and missing-route behavior cover known hosting policy.
   GETting executing `_worker.js` source, HTTP200 or a revision marker is NOT proof.
   Any failure/unverified item blocks a verified receipt. No automatic rebuild,
   redeploy or rollback follows a failure.

The protected upload receipt is initialized FAILED before protected intake can
refuse and always retained with available source/run/artifact/inventory/UUID
failure evidence. Wrangler stdout never establishes successful served bytes or
native admission.

## Extension identity and finite local qualification

Staging uses existing ID `palmhjikdacodimpnkapmidobfbocdgf`; production Web Store ID
`kimdfjefhbfgfecconmaiaaindjccidp` remains distinct. Source pins ONLY the staging
ID. `MDBASE_EXTENSION_STAGING_PUBLIC_KEY` supplies RSA PUBLIC SPKI to the
unprivileged build only; its derived ID must match. No private key is read,
allocated, rotated or exported. The existing keyring remains untouched.

`rpnpm` forwards neither local environment nor `.git`. For local source
qualification, copy the supplied PUBLIC-only transport JSON, unchanged and 0400,
to an untracked nonexcluded filename in this checkout, e.g.
`reader-staging-public-input.json`. Do not name it `.env*`, commit it, supply a
test-key fallback, forge GitHub refs, weaken a production guard or build locally.

```sh
rpnpm run test:publisher
rpnpm run test:publisher:evidence
rpnpm run test:publisher:offline
rpnpm run test:publisher:installer
rpnpm run check
# ONE actual staging build ONLY after the fresh frozen full check succeeds:
rpnpm --pull artifacts/build run build:native:staging reader-staging-public-input.json
# If compilation succeeded but ONLY packaging/post-verification failed, DO NOT rebuild:
rpnpm --pull artifacts/build run postqualify:native:staging reader-staging-public-input.json
```

Remove ONLY that owned temporary public input after terminal checks. The runner
records transport-file SHA, SPKI SHA and public ID separately from Git source.
Local plans explicitly carry `qualificationOnly: true`, null Git SHA/tree and no
publication authority; CI plans come only from the exact-clean-source guard.
The compiled target/native/SQLite/origin checks run only AFTER ALL original and
separate exact installer-output gates.
The unchanged UI companion still says `label: "dev intake, not release-qualified"`
and `releaseQualified: false`; those historical fields are not a live refusal
condition. The current authorized Reader UIb2 source-lock component and protected
hash control the new tuple, without rewriting historical metadata or claiming
new peer qualification.
The extension ZIP is exact-inventoried and checked against its public-key and
canonical app manifests. It uses Python's isolated standard-library ZIP writer,
not an assumed host `zip` executable, and refuses overwriting an existing ZIP.
Post-only recovery reasserts the SAVED full inventories (never regenerates them
to bless changed/extra files), checks unchanged plan/original inputs, and performs
NO app/SDK/Worker build, hooks, network or deployment. Its receipt is a sibling of
the publish artifact root, so it cannot add unexpected live artifact attachments.
This is neither Chrome installation nor native admission.

The ONE eaa4 Reader compilation used source `f5e269a` / tree `a7ec1b3…`: web,
extension and capture-Worker compilation passed. Initial command exit1 was solely
missing host `zip`, after all target/native/SQLite/compiled-trust/inline-manifest
checks. Standard-library packaging plus data-only post-check returned exit0 on
the SAME saved inventories: web157 files, offline-cache89 entries, extension58
files. Counts are Reader's actual output, not Tn's 58/69 or a peer transfer.
Full logs, exact output digests and the compilation/final verification source
identities are in the coordination report.

## External gates (not self-certified by source)

The parent must review LIVE source-ref policies, environment protections and
credential availability. Environment names remain `reader-staging` and
`reader-production`; secret NAMES are `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID`. No secret values belong in source, receipts or logs.

Staging web is `https://staging.mdbase-reader.pages.dev`, CP
`https://connect-staging.mdbase.dev`, log `https://log-staging.mdbase.dev`.
Production web is `https://reader.mdbase.dev`, CP `https://connect.mdbase.dev`.
Native staging does not use loopback. Existing LAB/legacy main CI/deploy/mobile/
store behavior is preserved.

Production requires a required Callum reviewer and NO admin bypass (NOT
prevent-self-review), separate Callum GO BEFORE any production tag/dispatch and
Callum UI environment approval afterwards. Hashes are not GO. Agents NEVER use
pending-deployments/approval APIs. Real live CI/deployment receipts and separate
web/extension native sign-in/grant/readiness/operation acceptance are still owed.
No old LAB receipt, Editor qualification or peer proof transfers to Reader.
