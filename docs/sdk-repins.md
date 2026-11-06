# SDK repins

The continuous SDK repin workflow is now owned by
`mdbase-dev/mdbase-cloud-ops/.github/workflows/sdk-repins.yml`. Its single
implementation is reached through `bin/release apps sdk-repin` in ops. The app
list, exact manifest scope, CI gates and operator instructions live in ops
`config/weekly-apps.json` and `docs/continuous-sdk-repins.md`.

The central workflow polls npm every 15 minutes and accepts manual dispatch on
ops main. It verifies the published SDK's signed provenance and archive digest,
then opens or updates `automation/sdk-repin` with exact production SDK pins and
the existing pnpm lockfile. The existing Reader CI must pass on that PR's exact
head before normal merge-on-green reconciliation may merge it. Failed or absent
CI leaves it open. Staging/LAB aliases, original archives and native qualification
records are not rewritten to make an upgrade pass.

The old Reader-local `sdk-repin.yml`, updater and its implementation-specific
tests are removed so there are not two writers of that branch. No changes to
Reader CI or the extension/store train are part of this ownership handoff.
Web deployments follow ops App CD after exact main CI, independent staging and
production smoke, and production compatibility checks. There is no web GO or UI
approval step. The independent extension tag/store train and its existing store
identity and review gates remain unchanged. The SDK updater does not deploy.
