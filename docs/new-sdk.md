# Reader on the mdbase SDK

Reader pins `@mdbase-dev/sdk` beta.210. Application access goes through `createMdbase`
and the public `Mdbase` interface; the shared collection UI and translations come from
`@mdbase-dev/ui` and `@mdbase-dev/i18n`. The manifest validator uses `@mdbase-dev/sdk/manifest`.
There is no direct legacy Connect or protocol dependency.

## Collections and repositories

Every web build enters `SdkReaderRoot` from `main.tsx`. The SDK owns sign-in,
selection, setup and connection lifetime. `nativeReaderCollection(connection)`
borrows that connection for Reader's domain repositories and never closes its client.
Repository values are native `RecordView`, `QueryResult` and plain JSON. Reads use
options objects; writes retain native record witnesses and settle through `settle`.
The old application sessions, Connect-shaped native adapter and revisionless
annotation cache have been removed.

Reader still owns its domain mapping, complete-list requirement, deletion confirmation,
and the create naming/relink journal. The SDK owns mutation identity, receipts,
optimistic state and record observation. Reader's connection and pending-write UI
uses `snapshot.sync.state` and `pendingFor`.

## Editors

Source notes and annotation editors open SDK native record leases through `Mdbase`.
They use the same interface whether the application was created directly or belongs
to a shared session. The SDK owns autosave, conflicts, observation and exact mutation
recovery. Reader keeps its existing source checkpoint and older annotation draft
recovery, retaining the SDK's actual recovery reference when needed.

The no-collection sample preview previously let users type and format source-note
Markdown, autosaving it through a callback-based legacy record session. Saved
annotations with a path and revision (including newly created source comments and
the anthology's bookmarks) could likewise be edited and deleted through their
editor. The three seeded James annotations already lacked those identities and
already had disabled Edit buttons. Both editors wrote to `PreviewGateway`'s own
in-memory arrays, not to a legacy in-memory Connect client or a real collection.
Reloading reset saved sample data; the source editor separately kept a
browser-local checkpoint for unsaved drafts.

The preview has no real `Mdbase`, so source-note Markdown is now read-only, its
format/save/insert toolbar is absent, and every annotation card's Edit button is
disabled. The annotation editor's body-editing and Delete annotation actions
are therefore unavailable, even for newly created comments. Source comments can
still be created, but cannot subsequently be edited through their cards. This
does not make the whole demo read-only: the existing gateway still handles
annotation creation, colour and ownership, source creation/removal, source and
citation details, reading state, saved views and annotation transclusion into
source notes. Deletion used by highlight release/undo also remains separate
from the unavailable editor. These are sample-only mutations; even the read-only
source-note body can still change through annotation transclusion. Connected
editors use native leases. No preview SDK, compatibility client or replacement
editor is introduced.

## Extension shared session

Each side panel, settings and welcome page, the service worker and the offscreen
document creates its own `createMdbase`. Every bundle receives the same build ID;
a rebuild gives it a new ID so old contexts cannot attach to a new build's Worker.
Only the offscreen document may host the SDK Worker. Pages and the service worker
pass `session: { build, host: false }` and call the SDK directly. Reader repositories
borrow each context's current connection and retire when its generation changes.
Selection belongs to each context; saved-page lookup selects the last collection
remembered by a visible page. Closing a page closes its own SDK entry.

The service worker creates the offscreen document on demand. The one lifecycle
message from extension pages asks it to do that; it carries no SDK commands or
record data. The SDK owns host election, reconnection and its BroadcastChannel
transport. Offscreen and service-worker entries report background activity; pages
follow their visibility. Reader's page and page-status fetch overrides remain.

The worker is an ES module because the SDK binds its assets and declaration to
`import.meta.url`. Chrome supports static module imports in service workers,
[but not dynamic imports](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/basics#import-scripts),
so page status is statically included instead of loaded with `importScripts`.
Creating its SDK entry and starting it still wait for a saved-page lookup.

There is no popup: the toolbar opens `capture.html` as a side panel. Content scripts
only capture page content, observe selection/post changes and draw highlights;
they never used the SDK RPC bridge. Those narrow `chrome.scripting` and runtime
messages stay. The SDK's `application/tabs.ts` uses same-origin Web Locks and
BroadcastChannel, and `application/entry.ts` binds the module and current origin to
the declaration. A content script on a web page cannot join the extension-origin
session: [isolated execution](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts#work_in_isolated_worlds)
does not change the [same-origin BroadcastChannel boundary](https://developer.mozilla.org/en-US/docs/Web/API/Broadcast_Channel_API).

`pnpm --filter @mdbase-reader/extension test:browser` builds two independent SDK
bundles and opens them together in Chromium. A non-hosting context waits for the
host, both open one local unsynced replica through one original SDK Worker, and
writes are read in both directions. Closing the follower leaves the host usable.
Registration is intercepted and all other external requests are refused; the
original packaged Worker, WASM and SQLite bytes run unchanged. This is shared-session
and local storage evidence, not authenticated Connect or log durability acceptance.
SDK-fixture tests also exercise independent adapter generations and two clients
of one memory replica.

Capture-create follow-through now lives with the context that performed the
capture. Closing it retires those adapters and their in-memory create journal;
the SDK's pending replica writes remain owned by the shared Worker. Automatic
renaming after a later path refusal therefore only follows while that context
remains open, instead of for the offscreen document's lifetime.

## Imports and validation

All environments use the SDK import destination and native migration target. A
started import stays bound to its confirmed collection; a retired scope cannot
publish completion for its replacement. Import settlement uses original mutation
identities and confirmed readback.

Unit tests use the public SDK `MemoryReplica` and application fixtures through
`@mdbase-reader/connect/testing`. They establish in-process behavior, not live LAB,
native-runtime, authentication or durability qualification. Historical vendored
archives and publisher custody metadata are maintained separately.
