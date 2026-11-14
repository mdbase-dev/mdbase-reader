## Removed

- Remove Reader's legacy Connect dependency, sessions and record adapter. Repositories and web editors use the SDK directly, including native record leases and mutation recovery. The extension editor uses its page's own shared-session SDK entry. Sample preview source-note Markdown is read-only and existing annotation cards no longer offer body editing; other sample-only gateway mutations remain available.
