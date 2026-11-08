## Removed

- Remove the legacy `@mdbase-dev/connect`, `@mdbase-dev/connect-dev` and `@mdbase-dev/connect-protocol` dependencies, the vendored protocol archives, and the unreachable legacy Connect session, import page and direct-access header control. Reader now depends only on `@mdbase-dev/sdk`, `@mdbase-dev/ui` and `@mdbase-dev/i18n`; manifest validation uses `@mdbase-dev/sdk/manifest`.
