import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * Zips the built extension for the Chrome Web Store. Run through `pnpm package`, which
 * builds for production unless `MDBASE_ENV` names another environment.
 */
const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");
const manifest = JSON.parse(await readFile(resolve(dist, "manifest.json"), "utf8"));
const environment = process.env["MDBASE_ENV"] ?? "production";
const suffix = environment === "production" ? "" : `-${environment}`;
const releases = resolve(root, "release");
const archive = resolve(releases, `mdbase-reader-${manifest.version}${suffix}.zip`);

await mkdir(releases, { recursive: true });
await rm(archive, { force: true });
// Source maps stay local: the store serves the package to every user.
execFileSync("zip", ["-qr", archive, ".", "-x", "*.map"], { cwd: dist, stdio: "inherit" });
console.log(`Packaged ${manifest.name} ${manifest.version} → ${archive}`);
