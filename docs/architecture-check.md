# Architecture check

`pnpm check:architecture` guards structural properties that ordinary linting
does not cover:

- production source files emit a warning at 1,000 lines and fail at 1,500
  lines;
- relative source imports and workspace package dependencies must remain
  acyclic;
- every internal workspace dependency must match the explicit package graph in
  `config/architecture-budgets.json`; and
- core domain and application modules must not import platform, rendering,
  Connect, React, Node, Electron, or Capacitor infrastructure.

Tests and generated sources are excluded from the line-count thresholds. A
legacy exception, if one is ever necessary, must record the file's exact line
count. It cannot grow, and the configuration must ratchet down when it shrinks.

The 1,500-line failure is an architectural signal, not a formatting target. Do
not split a file mechanically to get under the limit. Examine why it owns too
many responsibilities, where dependency direction or invariant ownership has
gone wrong, and undertake a cohesive refactor into well-owned modules with
focused tests.
