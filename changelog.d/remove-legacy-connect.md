## Removed

- Remove Reader's legacy Connect dependency, sessions and record adapter. Repositories and web editors use the SDK directly, including native record leases and mutation recovery. The extension editor uses its page's own shared-session SDK entry. Sample preview source-note Markdown is read-only with no format/save/insert toolbar; annotation cards disable editing, including the editor's deletion action. Source comments can still be created and annotations inserted into source notes; other sample-only gateway mutations remain available.
