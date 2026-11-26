## Removed

- Remove the 120-line function limit from ESLint and the 1,000/1,500-line file budget from the architecture check. The architecture check keeps its import-cycle, workspace dependency and forbidden-import rules, now configured in `config/architecture.json`.
