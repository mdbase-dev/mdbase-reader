# Architecture check

`pnpm check:architecture` guards structural properties that ordinary linting
does not cover:

- relative source imports and workspace package dependencies must remain
  acyclic;
- every internal workspace dependency must match the explicit package graph in
  `config/architecture.json`; and
- core domain and application modules must not import platform, rendering,
  Connect, React, Node, Electron, or Capacitor infrastructure.

The check does not limit file, function or bundle sizes.
