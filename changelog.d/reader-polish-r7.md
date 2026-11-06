## Fixed

- Pin Reader and the extension to SDK beta.157 with verified LAB/staging originals and the exact production npm version; retain the existing UI version.
- Keep a single named loading shell, reduce library keyboard stops, follow the focused source in commands, and improve phone spacing and shared motion.
- Show offline and pending-change recovery honestly using the SDK's existing incidents and inventory, without inventing rejected writes or claiming a stopped upload never committed.
- Keep rejected-only, mixed, and pending-only save messages distinct when a sync incident is present; an incident does not prove a change is pending.
- Bound annotation source resolution per record instead of projecting the entire collection; show a plain query-budget error without silently returning an incomplete list.
- Replace rounded active-item and callout edge stripes with plain fills, preserving pane dividers and square in-document reading rules.
