# App settings

Status: implemented. Reader's collection-wide settings are its file name templates
(`feat/app-settings-naming`) and its highlight colours (`feat/highlight-colour-settings`).
This follows the "App settings records for mdbase" spec. The notes below cover what
Reader does and where it departs from the spec.

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
highlight_colors: [pink, yellow, blue]
highlight_meanings:
  pink: Question
  yellow: Key point
---
```

The app id is Reader's manifest id, `dev.mdbase.reader`, which is also its contract
namespace. A field that is absent takes Reader's default, and resetting a setting in
the UI removes its field.

Reader's type pack (`apps/reader/mdbase/`, version 1.0.0-beta.7) ships the following,
laid out as in mdbase-contracts so it can be lifted unchanged:

| Resource                                                             | Mode    |
| -------------------------------------------------------------------- | ------- |
| `contracts/mdbase.app-settings/1.0.0.md` + schema                    | managed |
| `contracts/dev.mdbase.reader.settings/1.1.0.md` + schema             | managed |
| `types/reader-settings.md`, installed as `_types/reader-settings.md` | seed    |

- **Reserved fields.** The generic contract fixes `app`, `scope` and
  `settings_version`. `user` is defined for `scope: user` but is not used yet.
- **The type.** `reader-settings` has `schema.ref` pointing at the managed Reader
  schema, and carries no inline copy of it. It declares
  `collection.unique: [{field: app, scope: type}]` and implements both contracts.
- **Contract digests.** The pack's contract digests resolve the schema ref before
  hashing, as mdbase-contracts does.

### Versions

- **beta.6** added the settings: `dev.mdbase.reader.settings` 1.0.0, with the two
  templates, and version 1 of the `reader-settings` starter.
- **beta.7** adds the highlight fields. A contract's digest covers its schema, and
  readiness treats a different digest at the same id and version as incompatible, so
  the new fields need a new contract version: 1.1.0, a minor version because both are
  optional. 1.0.0 leaves the pack, and the installer deletes an unedited copy on
  upgrade. Version 2 of the starter references the 1.1.0 schema and implements 1.1.0;
  its `upgrade_from` is the beta.6 starter (`baselines/1.0.0-beta.6/`), so an unedited
  type is replaced and an edited one merged. `mdbase.app-settings` stays 1.0.0. The
  upgrade is the usual one-time pack prompt, and an existing record needs no change.
- **`settings_version` stays 1.** It exists to stop an older client writing settings it
  does not understand. New optional fields don't need that: an older Reader patches
  only its own fields and keeps the rest. Raising it would make every older Reader
  read-only for no benefit.

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

## Highlight colours

Reader's five colours are fixed: `yellow`, `green`, `blue`, `pink` and `purple`. There
are no custom colours. An annotation stores only its colour key.

| Field                | Default                 | Means                                         |
| -------------------- | ----------------------- | --------------------------------------------- |
| `highlight_colors`   | all five, in that order | the colours offered, in order                 |
| `highlight_meanings` | `{}`                    | a label of up to 40 characters for any colour |

- **Reading.** Unknown colours are ignored, and duplicates are dropped. A list that names
  no known colour, a value that isn't a list, or meanings that aren't an object take the
  default with a warning. Meanings are trimmed, spaces are collapsed, and blank ones are
  dropped. The schema is stricter: at least one colour, none twice, only the five, and
  meanings of 1 to 40 characters.
- **Hidden colours.** A colour left out of `highlight_colors` is only not offered when
  making or recolouring a highlight. Its highlights keep their colour and meaning, show
  in cards, and can be recoloured. The filter menu lists offered colours in order, then a
  hidden colour while some highlight uses it or it is the active filter.
- **Meanings relabel.** Since highlights store only the key, changing a meaning
  relabels every highlight in that colour. The settings say so.
- **Default colour stays per device.** The colour of the next highlight is the last one
  used on this device (localStorage `mdbase-reader:highlight-color`, and the extension's
  `chrome.storage.local`), as before. It is a habit rather than a shared convention.
  The Settings page's "This device" section can also set it.
  While it is hidden, new highlights use the first offered colour. The stored preference
  is kept, so showing the colour again restores it, until a highlight records the colour
  actually used.
- **Import of device meanings.** Meanings used to be stored per device in localStorage
  (`mdbase-reader:highlight-meanings`). Until the record holds `highlight_meanings`,
  Reader shows the device's meanings, so nothing visibly changes on upgrade. Highlight
  colours pre-fills them with a notice, and Save shares them. Nothing is written on read. Once
  the record holds meanings, the device's are ignored. Any successful save of highlight
  colours forgets them on that device, so a later reset doesn't bring them back.
- **Extension.** The panel's colour picker reads the same record. The SDK host's
  `ReaderSettingsStore` follows the feed. The panel asks it for plain data
  (`settings.highlightColors`, allow-listed in `sdk-rpc.ts`) when the collection
  changes, on each new selection, and when the panel regains focus or visibility.

## UI

Collection settings are edited on the Settings page (`SettingsPage.tsx`), opened from
"Settings…" at the foot of the display menu. The menu keeps its quick reading choices.

- **The page.** It opens over the workspace, which stays mounted and inert behind it, so
  open documents aren't reloaded and nothing behind it moves. Its sections
  (`SettingsSections.tsx`) load on demand, with a loading line inside the page. Focus
  goes to the "Settings" heading, and Back returns it to the display menu's trigger.
  Workspace shortcuts don't act while the page is open.
- **Sections.** "This device" has the display menu's choices and the default highlight
  colour. "This collection" has Highlight colours and File names, each with its own
  Save. When the collection has no settings support (no settings store), the section
  says so instead. "Connection" names the open collection and its state, and offers the
  shared collection menu, which switches collections, manages access and signs out.
- **Leaving.** Back with unsaved collection edits asks first, with Reader's usual
  confirm ("Discard changes" or "Keep editing"). So does switching collection from the
  page. This device's old meanings, shown but not yet saved, don't count as an edit.

Before this page, both settings were dialogs behind "Highlight colours…" and "File
names…" in the menu. Their lazy-load fallback, a "Loading …" line, rendered as a child
of the shell's grid while the chunk downloaded. It took the header's row and pushed the
header and dock down, so the workspace jumped and re-laid out as each dialog opened.

Highlight colours lists the offered colours in order, then a "Hidden" group. Each row
has a meaning field. An offered row has "Move up", "Move down" and "Hide". A hidden row
has only "Show", because `highlight_colors` lists only offered colours and keeps no place
for a hidden one; Show adds it at the end.

- **Hiding.** The last shown colour can't be hidden.
- **Focus.** Moving keeps focus on the moved row's button, or its other button at an end.
  Hide and Show move focus to the colour's button in its new group. A live region
  announces each change.
- **Reset.** "Reset to default" removes both fields.
- **States.** Read-only, conflict, live-follow and invalid-field handling match File
  names. A conflict names the field that changed elsewhere.

Reader binds the store to a module-level snapshot (`highlight-colors.ts`) while the
workspace is open. Swatches, the selection toolbar (digits 1 to n follow the offered
order), cards and the filter menu read it through `useSyncExternalStore`, so they all
follow live edits.

File names has one field per template.

- **Live preview.** Each field previews against up to three of the user's sources
  (open sources first) and annotations. While a draft is invalid, the last valid
  preview stays.
- **Errors and warnings.** Knap errors show inline, and Save stays disabled until they
  are fixed. A saved template that Reader can't use shows a warning.
- **Reset.** Each field has its own "Reset to default".
- **Explanation.** The section says changes are shared across devices and only affect
  new items.
- **Live updates.** Fields the user hasn't edited follow edits from other devices as
  they arrive.

## Departures from the spec and open points

- **Catalog types with `schema.ref`.** mdbase-contracts' catalog build rejects
  catalog-listed types that use `schema.ref`. Reader's pack is not built by that script,
  but lifting the type into the catalog needs that rule relaxed.
- **Adding a setting.** The type pins contract versions in `implements` and points at a
  versioned schema file. Adding a setting means a new contract version, so the seed type
  still needs updating. The highlight fields did exactly this (contract 1.1.0, starter
  version 2). This falls short of the spec's "without touching user-owned files".
  Pointing the ref at an unversioned "current" schema would fix it. An edited starter
  is merged three-way. One whose lock predates recorded origins is kept, still pointing
  at the deleted 1.0.0 schema, and needs a manual fix.
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
