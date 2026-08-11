import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as ts from "typescript";

const SOURCE_ROOTS = ["apps", "packages"];
const SOURCE_EXTENSIONS = new Set([".js", ".mjs", ".mts", ".ts", ".tsx"]);
const IGNORED_DIRECTORIES = new Set(["dist", "node_modules", "out"]);
const REFACTOR_GUIDANCE =
  "Do not make a quick line-count-only fix. Undertake a cohesive architectural refactor: " +
  "identify misplaced responsibilities and broken dependency or invariant ownership, then " +
  "extract well-owned modules with focused tests.";

const relativePath = (root, value) => path.relative(root, value).split(path.sep).join("/");

function isTestFile(file) {
  return /(^|\/)(test|tests)\//.test(file) || /\.(spec|test)\.[^.]+$/.test(file);
}

function lineCount(source) {
  if (source.length === 0) return 0;
  const lines = source.split(/\r?\n/);
  return lines.at(-1) === "" ? lines.length - 1 : lines.length;
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(target)));
    else if (entry.isFile()) files.push(target);
  }
  return files;
}

async function sourceFiles(root) {
  const files = [];
  for (const sourceRoot of SOURCE_ROOTS) {
    try {
      files.push(...(await walk(path.join(root, sourceRoot))));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return files.filter((file) => SOURCE_EXTENSIONS.has(path.extname(file))).sort();
}

function scriptKind(file) {
  if (file.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (file.endsWith(".js") || file.endsWith(".mjs")) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function importedSpecifiers(source, file) {
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(file),
  );
  const all = [];
  const runtime = [];
  const add = (node, typeOnly = false) => {
    if (!node || !ts.isStringLiteralLike(node)) return;
    all.push(node.text);
    if (!typeOnly) runtime.push(node.text);
  };
  const importIsTypeOnly = (node) => {
    const clause = node.importClause;
    if (!clause) return false;
    if (clause.isTypeOnly) return true;
    return (
      !clause.name &&
      clause.namedBindings &&
      ts.isNamedImports(clause.namedBindings) &&
      clause.namedBindings.elements.every((element) => element.isTypeOnly)
    );
  };
  const exportIsTypeOnly = (node) =>
    node.isTypeOnly ||
    (node.exportClause &&
      ts.isNamedExports(node.exportClause) &&
      node.exportClause.elements.every((element) => element.isTypeOnly));
  function visit(node) {
    if (ts.isImportDeclaration(node)) {
      add(node.moduleSpecifier, importIsTypeOnly(node));
    } else if (ts.isExportDeclaration(node)) {
      add(node.moduleSpecifier, exportIsTypeOnly(node));
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      add(node.moduleReference.expression);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      add(node.argument.literal, true);
    } else if (ts.isCallExpression(node)) {
      const dynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const requireCall = ts.isIdentifier(node.expression) && node.expression.text === "require";
      if (dynamicImport || requireCall) add(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return { all, runtime };
}

function importCandidates(importer, specifier) {
  const absolute = path.resolve(path.dirname(importer), specifier);
  const extension = path.extname(absolute);
  const stem =
    extension === ".js" || extension === ".mjs" ? absolute.slice(0, -extension.length) : absolute;
  return [
    absolute,
    `${stem}.ts`,
    `${stem}.tsx`,
    `${stem}.mts`,
    `${stem}.mjs`,
    `${stem}.js`,
    path.join(absolute, "index.ts"),
    path.join(absolute, "index.tsx"),
    path.join(absolute, "index.mts"),
    path.join(absolute, "index.mjs"),
    path.join(absolute, "index.js"),
  ].map(path.normalize);
}

function canonicalCycle(cycle) {
  const members = cycle.slice(0, -1);
  const rotations = members.map((_, index) => [
    ...members.slice(index),
    ...members.slice(0, index),
  ]);
  rotations.sort((a, b) => a.join("\0").localeCompare(b.join("\0")));
  return [...rotations[0], rotations[0][0]];
}

function graphCycles(graph) {
  const state = new Map();
  const stack = [];
  const cycles = new Map();
  function visit(node) {
    state.set(node, "visiting");
    stack.push(node);
    for (const dependency of graph.get(node) ?? []) {
      if (!graph.has(dependency)) continue;
      if (state.get(dependency) === "visiting") {
        const start = stack.lastIndexOf(dependency);
        const cycle = canonicalCycle([...stack.slice(start), dependency]);
        cycles.set(cycle.join("\0"), cycle);
      } else if (!state.has(dependency)) visit(dependency);
    }
    stack.pop();
    state.set(node, "visited");
  }
  for (const node of [...graph.keys()].sort()) {
    if (!state.has(node)) visit(node);
  }
  return [...cycles.values()].sort((a, b) => a.join("\0").localeCompare(b.join("\0")));
}

async function sourceImportData(root, files) {
  const productionFiles = files.filter((file) => !isTestFile(relativePath(root, file)));
  const knownFiles = new Set(productionFiles.map(path.normalize));
  const specifiers = new Map();
  const graph = new Map();
  for (const file of productionFiles) {
    const imports = importedSpecifiers(await readFile(file, "utf8"), file);
    specifiers.set(path.normalize(file), imports.all);
    const dependencies = imports.runtime
      .filter((specifier) => specifier.startsWith("."))
      .flatMap((specifier) => importCandidates(file, specifier))
      .filter((candidate) => knownFiles.has(candidate));
    graph.set(path.normalize(file), [...new Set(dependencies)].sort());
  }
  return { graph, specifiers };
}

async function workspacePackages(root) {
  const packages = new Map();
  for (const workspaceRoot of SOURCE_ROOTS) {
    let entries = [];
    try {
      entries = await readdir(path.join(root, workspaceRoot), {
        withFileTypes: true,
      });
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const manifest = JSON.parse(
          await readFile(path.join(root, workspaceRoot, entry.name, "package.json"), "utf8"),
        );
        if (typeof manifest.name === "string") {
          packages.set(manifest.name, manifest);
        }
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
  }
  return packages;
}

function workspacePackageGraph(packages) {
  const graph = new Map();
  for (const [name, manifest] of packages) {
    const dependencies = {
      ...manifest.dependencies,
      ...manifest.optionalDependencies,
      ...manifest.peerDependencies,
      ...manifest.devDependencies,
    };
    graph.set(
      name,
      Object.keys(dependencies)
        .filter((dependency) => packages.has(dependency))
        .sort(),
    );
  }
  return graph;
}

function validatePackageBoundaries(graph, expected, failures) {
  if (!expected || typeof expected !== "object" || Array.isArray(expected)) {
    failures.push("workspacePackageDependencies must be an object.");
    return;
  }
  for (const [name, dependencies] of graph) {
    if (!Object.hasOwn(expected, name)) {
      failures.push(`Unregistered workspace package: ${name}.`);
      continue;
    }
    const allowed = new Set(expected[name]);
    for (const dependency of dependencies) {
      if (!allowed.has(dependency)) {
        failures.push(`Package boundary: ${name} must not depend on ${dependency}.`);
      }
    }
    for (const dependency of allowed) {
      if (!dependencies.includes(dependency)) {
        failures.push(
          `Package boundary configuration for ${name} allows unused dependency ${dependency}; remove the stale permission.`,
        );
      }
    }
  }
  for (const name of Object.keys(expected)) {
    if (!graph.has(name)) {
      failures.push(`Configured workspace package ${name} does not exist.`);
    }
  }
}

function matchesPathPattern(file, pattern) {
  if (!pattern.endsWith("/**")) return file === pattern;
  const directory = pattern.slice(0, -3);
  return file === directory || file.startsWith(`${directory}/`);
}

function validateForbiddenImports(root, importsByFile, rules, failures) {
  for (const rule of rules ?? []) {
    for (const [absoluteFile, specifiers] of importsByFile) {
      const file = relativePath(root, absoluteFile);
      if (!(rule.paths ?? []).some((pattern) => matchesPathPattern(file, pattern))) {
        continue;
      }
      for (const specifier of specifiers) {
        const forbidden =
          (rule.forbiddenSpecifiers ?? []).includes(specifier) ||
          (rule.forbiddenPrefixes ?? []).some((prefix) => specifier.startsWith(prefix));
        if (forbidden) {
          failures.push(
            `Dependency boundary "${rule.name}": ${file} must not import ${specifier}.`,
          );
        }
      }
    }
  }
}

export async function evaluateArchitecture(root, budgets) {
  const files = await sourceFiles(root);
  const failures = [];
  const warnings = [];
  const productionFiles = files.filter((file) => !isTestFile(relativePath(root, file)));
  const warning = budgets.lineCountWarningLines;
  const error = budgets.lineCountErrorLines;
  const validThresholds =
    Number.isSafeInteger(warning) && warning > 0 && Number.isSafeInteger(error) && error > warning;
  if (!Number.isSafeInteger(warning) || warning < 1) {
    failures.push("lineCountWarningLines must be a positive integer.");
  }
  if (!Number.isSafeInteger(error) || error <= warning) {
    failures.push("lineCountErrorLines must be an integer greater than lineCountWarningLines.");
  }

  const legacyBudgets = budgets.legacyFileLineBudgets ?? {};
  const measured = new Map();
  for (const file of productionFiles) {
    const relative = relativePath(root, file);
    if (/\.generated\.[^.]+$/.test(relative)) continue;
    const lines = lineCount(await readFile(file, "utf8"));
    measured.set(relative, lines);
    if (!validThresholds) continue;
    const baseline = legacyBudgets[relative];
    if (baseline !== undefined) {
      if (!Number.isSafeInteger(baseline) || baseline < error) {
        failures.push(
          `${relative} has an invalid legacy baseline; exceptions must be at least ${error} lines.`,
        );
      } else if (lines > baseline) {
        failures.push(
          `${relative} grew from its legacy baseline of ${baseline} to ${lines} lines and is above the ${error}-line hard limit. ${REFACTOR_GUIDANCE}`,
        );
      } else if (lines < baseline) {
        failures.push(
          `${relative} shrank from its legacy baseline of ${baseline} to ${lines} lines; lower the baseline in config/architecture-budgets.json so the improvement cannot regress.`,
        );
      }
      warnings.push(
        `${relative} has ${lines} lines and is temporarily grandfathered above the ${error}-line hard limit. Plan a proper architectural refactor; do not grow it.`,
      );
    } else if (lines >= error) {
      failures.push(
        `${relative} has ${lines} lines; the hard limit is ${error}. ${REFACTOR_GUIDANCE}`,
      );
    } else if (lines >= warning) {
      warnings.push(
        `${relative} has ${lines} lines; review its cohesion before it reaches the ${error}-line hard limit.`,
      );
    }
  }
  for (const file of Object.keys(legacyBudgets)) {
    if (!measured.has(file)) {
      failures.push(`${file} has a legacy baseline but is not a production source file.`);
    }
  }

  const importData = await sourceImportData(root, files);
  for (const cycle of graphCycles(importData.graph)) {
    failures.push(
      `Relative import cycle: ${cycle.map((file) => relativePath(root, file)).join(" -> ")}`,
    );
  }
  validateForbiddenImports(root, importData.specifiers, budgets.forbiddenImportRules, failures);

  const packageGraph = workspacePackageGraph(await workspacePackages(root));
  validatePackageBoundaries(packageGraph, budgets.workspacePackageDependencies, failures);
  for (const cycle of graphCycles(packageGraph)) {
    failures.push(`Workspace package cycle: ${cycle.join(" -> ")}`);
  }

  return {
    failures,
    warnings,
    productionFileCount: productionFiles.length,
    relativeImportCount: [...importData.graph.values()].reduce(
      (total, dependencies) => total + dependencies.length,
      0,
    ),
    workspacePackageCount: packageGraph.size,
  };
}

export async function checkArchitecture(root) {
  const budgets = JSON.parse(
    await readFile(path.join(root, "config", "architecture-budgets.json"), "utf8"),
  );
  return evaluateArchitecture(root, budgets);
}

export function reportArchitecture(result) {
  for (const warning of result.warnings) {
    console.warn(`- warning: ${warning}`);
  }
  for (const failure of result.failures) console.error(`- error: ${failure}`);
  if (result.failures.length > 0) return false;
  console.log(
    `Architecture check passed with ${result.warnings.length} warning(s): ` +
      `${result.productionFileCount} production files, ` +
      `${result.relativeImportCount} relative imports, ` +
      `${result.workspacePackageCount} workspace packages.`,
  );
  return true;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const root = path.resolve(process.argv[2] ?? process.cwd());
  if (!reportArchitecture(await checkArchitecture(root))) process.exitCode = 1;
}
