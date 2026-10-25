# App settings

Status: implemented on `feat/app-settings-naming`. Reader's first collection-wide
settings are its file name templates. This follows the "App settings records for
mdbase" spec. The notes below cover what Reader does and where it departs from the spec.

## Record, type and contracts

The record lives at `_settings/dev.mdbase.reader.md`:

```yaml
---
type: reader-settings
app: dev.mdbase.reader
scope: collection
settings_version: 1
source_name_template: "{{ year }}/{{ author }} - {{ title }}"
annotation_name_template: "{{ words }}"
---
```

The app id is Reader's manifest id, `dev.mdbase.reader`, which is also its contract
namespace. A field that is absent takes Reader's default, and resetting a template in
the UI removes its field.

Reader's type pack (`apps/reader/mdbase/`, version 1.0.0-beta.6) ships the following,
laid out as in mdbase-contracts so it can be lifted unchanged:

| Resource                                                             | Mode    |
| -------------------------------------------------------------------- | ------- |
| `contracts/mdbase.app-settings/1.0.0.md` + schema                    | managed |
| `contracts/dev.mdbase.reader.settings/1.0.0.md` + schema             | managed |
| `types/reader-settings.md`, installed as `_types/reader-settings.md` | seed    |

- **Reserved fields.** The generic contract fixes `app`, `scope` and
  `settings_version`. `user` is defined for `scope: user` but is not used yet.
- **The type.** `reader-settings` has `schema.ref` pointing at the managed Reader
  schema, and carries no inline copy of it. It declares
  `collection.unique: [{field: app, scope: type}]` and implements both contracts.
- **Contract digests.** The pack's contract digests resolve the schema ref before
  hashing, as mdbase-contracts does.

## Client behaviour

`AppSettingsStore` (`packages/connect/src/app-settings-store.ts`) is generic over an
app's values. `ReaderSettingsStore` (`reader-settings.ts`) adds Reader's fields and
template checks.

- **Read.** The store reads the record by path, with no query, and keeps its revision. A
  missing record gives the defaults, and a read never creates the record. A field that
  is not a string, is empty or is over 500 characters takes its default with a warning.
  A template Knap can't parse also takes its default with a warning. The record is never
  rewritten on read.
- **Live edits.** On native collections the store follows the change feed from its
  first read until the collection is disposed, whether or not a screen is open. It
  reloads on a reset, or on a change to its own path. Legacy Connect collections have no feed,
  so their settings load once per session.
- **Save.**
  - The first save creates the record at the fixed path. If another client created it
    first, the store re-reads it and updates. A native first save can return pending
    and then be refused at head (`path_taken`). The store remembers it, and on the next
    reload it saves the same changes again as a patch, with "no record" as the base.
    So a field that both devices set becomes a conflict, and the other device's value
    stays.
  - Later saves patch only the changed fields, using `ifRevision`. `null` removes a
    field. Unknown keys and the body are kept.
  - On a revision conflict, the store re-reads and retries once. If the same field
    changed on both sides, the UI shows the conflict instead of saving.
- **No reindex.** A save changes no type or index. Templates are read when a source or
  annotation is created.
- **Read-only cases.**
  - A `settings_version` above 1 makes the settings read-only: the store uses them as
    written and tells the user to update Reader.
  - A save refused with `not_authorized` or `access_denied` makes them read-only for
    the session and says why.

## Templates

There are two templates:

| Field                      | Default               | Names                                  |
| -------------------------- | --------------------- | -------------------------------------- |
| `source_name_template`     | `{{ title \| slug }}` | source notes, chapters and other parts |
| `annotation_name_template` | `{{ id }}`            | annotations                            |

Both defaults reproduce today's names exactly: the code takes the planned paths
unchanged. Tests check this over awkward titles, including reserved names, empty,
unicode and long titles.

- **Engine.** Knap is pinned at exactly `0.6.0` and loaded on demand. Regex is off.
  - Filters are allow-listed: `slug`, `lower`, `upper`, `capitalize`, `title`, `trim`,
    `truncate`, `replace`, `split`, `join`, `first`, `last`, `slice`, `length` and
    `date`.
  - `slug` is Reader's own slug function. It takes 60 characters by default, and
    accepts 1 to 120.
  - Limits: a template may be 500 characters, the output 4000 and each value 20000. A
    render may run 5000 operations, with a nesting depth of 16.
- **Variables.** The settings contract lists them.
  - Sources: `title`, `authors`, `author`, `year`, `type`, `publisher`, `site`, `id`,
    `short_id` and `date`. Chapters also get `parent_title`, `parent_author`,
    `parent_year` and `parent_stem`.
  - Annotations: `id`, `short_id`, `type`, `quote`, `words`, `page`, `color`, `date`
    and `source_stem`.
- **Safety.** The rendered name goes through core `safeName`, segment by segment.
  - `safeName` turns `#`, `^`, `[` and `]` into spaces, as well as the characters file
    systems refuse, so a wikilink or transclusion to the record still resolves.
  - Only source templates may contain `/`, with at most `maxPreferredFolders` (3)
    folders under `sources/`. In an annotation name, `/` becomes a space.
  - The rendered name is the first candidate. The usual fallbacks follow: author and
    year, then 4 and 8 characters of the ID, then the ID.
  - An empty render, a failed render or an unsafe result uses the default names.
- **Existing records.** Nothing is ever moved. A template affects only records created
  after it is saved.

## UI

The display menu has a section called "This collection". Its "File names…" button opens
a dialog with one field per template.

- **Live preview.** Each field previews against up to three of the user's sources
  (open sources first) and annotations. While a draft is invalid, the last valid
  preview stays.
- **Errors and warnings.** Knap errors show inline, and Save stays disabled until they
  are fixed. A saved template that Reader can't use shows a warning.
- **Reset.** Each field has its own "Reset to default".
- **Explanation.** The dialog says changes are shared across devices and only affect
  new items.
- **Live updates.** Fields the user hasn't edited follow edits from other devices as
  they arrive.

The dialog loads lazily (`use-file-name-settings.tsx`).

## Departures from the spec and open points

- **Catalog types with `schema.ref`.** mdbase-contracts' catalog build rejects
  catalog-listed types that use `schema.ref`. Reader's pack is not built by that script,
  but lifting the type into the catalog needs that rule relaxed.
- **Adding a setting.** The type pins contract versions in `implements` and points at a
  versioned schema file. Adding a setting means a new contract version, so the seed type
  still needs updating. This falls short of the spec's "without touching user-owned
  files". Pointing the ref at an unversioned "current" schema would fix it.
- **The `type` field.** Reader passes it as the create's type rather than as a
  frontmatter field. The spec does not say which explicit type key a settings record
  should use.
- **App id.** The spec doesn't say how the app id relates to the manifest id or the
  contract namespace. Reader uses one id for all three.
- **Template validation.** It runs in the client, because Knap is not part of the
  schema. A hand-edited bad template passes Connect's validation, and Reader falls back
  with a warning.
- **User scope.** Reader has none yet. The store keys on a path and the reserved
  fields, so a user layer can be added later without changing the record.
