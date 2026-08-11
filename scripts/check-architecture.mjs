#!/usr/bin/env node

import { checkArchitecture, reportArchitecture } from "./lib/architecture-check.mjs";

if (!reportArchitecture(await checkArchitecture(process.cwd()))) {
  process.exitCode = 1;
}
