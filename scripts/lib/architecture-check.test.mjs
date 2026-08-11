import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { evaluateArchitecture } from "./architecture-check.mjs";

async function fixture(files) {
  const root = await mkdtemp(path.join(tmpdir(), "mdbase-reader-architecture-"));
  const completeFiles = {
    "packages/example/package.json": JSON.stringify({
      name: "@mdbase-reader/example",
    }),
    ...files,
  };
  for (const [relative, source] of Object.entries(completeFiles)) {
    const target = path.join(root, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, source);
  }
  return root;
}

const strictBudget = {
  lineCountWarningLines: 3,
  lineCountErrorLines: 5,
  legacyFileLineBudgets: {},
  workspacePackageDependencies: { "@mdbase-reader/example": [] },
  forbiddenImportRules: [],
};

test("accepts small acyclic modules", async (t) => {
  const root = await fixture({
    "packages/example/src/a.ts": "import { b } from './b.js';\nexport const a = b;\n",
    "packages/example/src/b.ts": "export const b = 1;\n",
  });
  t.after(() => rm(root, { recursive: true, force: true }));

  const result = await evaluateArchitecture(root, strictBudget);

  assert.deepEqual(result.failures, []);
  assert.deepEqual(result.warnings, []);
});

test("warns at the warning threshold", async (t) => {
  const root = await fixture({
    "packages/example/src/large.ts": "one\ntwo\nthree\n",
  });
  t.after(() => rm(root, { recursive: true, force: true }));

  const result = await evaluateArchitecture(root, strictBudget);

  assert.deepEqual(result.failures, []);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /has 3 lines/);
});

test("errors at the hard limit with proper-refactor guidance", async (t) => {
  const root = await fixture({
    "packages/example/src/large.ts": "one\ntwo\nthree\nfour\nfive\n",
  });
  t.after(() => rm(root, { recursive: true, force: true }));

  const result = await evaluateArchitecture(root, strictBudget);

  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0], /hard limit is 5/);
  assert.match(result.failures[0], /Do not make a quick line-count-only fix/);
  assert.match(result.failures[0], /cohesive architectural refactor/);
});

test("ignores generated sources for line budgets", async (t) => {
  const root = await fixture({
    "packages/example/src/catalog.generated.ts": "one\ntwo\nthree\nfour\nfive\n",
  });
  t.after(() => rm(root, { recursive: true, force: true }));

  const result = await evaluateArchitecture(root, strictBudget);

  assert.deepEqual(result.failures, []);
  assert.deepEqual(result.warnings, []);
});

test("grandfathers only an exact legacy baseline", async (t) => {
  const file = "packages/example/src/legacy.ts";
  const root = await fixture({ [file]: "one\ntwo\nthree\nfour\nfive\nsix\n" });
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = await evaluateArchitecture(root, {
    ...strictBudget,
    legacyFileLineBudgets: { [file]: 6 },
  });

  assert.deepEqual(result.failures, []);
  assert.match(result.warnings[0], /temporarily grandfathered/);
});

test("requires legacy baselines to ratchet down", async (t) => {
  const file = "packages/example/src/legacy.ts";
  const root = await fixture({ [file]: "one\ntwo\nthree\nfour\nfive\n" });
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = await evaluateArchitecture(root, {
    ...strictBudget,
    legacyFileLineBudgets: { [file]: 6 },
  });

  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0], /lower the baseline/);
});

test("rejects legacy growth with proper-refactor guidance", async (t) => {
  const file = "packages/example/src/legacy.ts";
  const root = await fixture({
    [file]: "one\ntwo\nthree\nfour\nfive\nsix\nseven\n",
  });
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = await evaluateArchitecture(root, {
    ...strictBudget,
    legacyFileLineBudgets: { [file]: 6 },
  });

  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0], /grew from its legacy baseline/);
  assert.match(result.failures[0], /cohesive architectural refactor/);
});

test("uses the TypeScript AST to detect import cycles", async (t) => {
  const root = await fixture({
    "packages/example/src/a.ts": "// import './not-real.js'\nexport { b } from './b.js';\n",
    "packages/example/src/b.ts": "export { a } from './a.js';\n",
  });
  t.after(() => rm(root, { recursive: true, force: true }));

  const result = await evaluateArchitecture(root, strictBudget);

  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0], /^Relative import cycle:/);
});

test("does not report a runtime cycle through a type-only import", async (t) => {
  const root = await fixture({
    "packages/example/src/a.ts": "import { b } from './b.js';\nexport const a = b;\n",
    "packages/example/src/b.ts":
      "import type { a } from './a.js';\nexport const b: typeof a = 1;\n",
  });
  t.after(() => rm(root, { recursive: true, force: true }));

  const result = await evaluateArchitecture(root, strictBudget);

  assert.deepEqual(result.failures, []);
});

test("enforces exact workspace dependency permissions", async (t) => {
  const root = await fixture({
    "packages/example/package.json": JSON.stringify({
      name: "@mdbase-reader/a",
      devDependencies: { "@mdbase-reader/b": "workspace:*" },
    }),
    "packages/a/src/index.ts": "export const a = true;\n",
    "packages/b/package.json": JSON.stringify({ name: "@mdbase-reader/b" }),
    "packages/b/src/index.ts": "export const b = true;\n",
  });
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = await evaluateArchitecture(root, {
    ...strictBudget,
    workspacePackageDependencies: {
      "@mdbase-reader/a": [],
      "@mdbase-reader/b": ["@mdbase-reader/a"],
    },
  });

  assert.ok(
    result.failures.includes(
      "Package boundary: @mdbase-reader/a must not depend on @mdbase-reader/b.",
    ),
  );
  assert.ok(
    result.failures.some((failure) => failure.includes("unused dependency @mdbase-reader/a")),
  );
});

test("rejects path-specific forbidden imports", async (t) => {
  const root = await fixture({
    "packages/example/src/domain/model.ts": "import fs from 'node:fs';\nexport const value = fs;\n",
  });
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = await evaluateArchitecture(root, {
    ...strictBudget,
    forbiddenImportRules: [
      {
        name: "domain stays platform-free",
        paths: ["packages/example/src/domain/**"],
        forbiddenPrefixes: ["node:"],
      },
    ],
  });

  assert.ok(
    result.failures.includes(
      'Dependency boundary "domain stays platform-free": packages/example/src/domain/model.ts must not import node:fs.',
    ),
  );
});
