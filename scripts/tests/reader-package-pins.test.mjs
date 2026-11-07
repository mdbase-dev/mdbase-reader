import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { execFileSync } from "node:child_process";

test("Reader and extension share the exact SDK, UI and i18n release, including packaged SDK targets", async () => {
  for (const app of ["reader", "extension"]) {
    const { dependencies } = JSON.parse(
      await readFile(new URL(`../../apps/${app}/package.json`, import.meta.url)),
    );
    for (const name of ["ui", "i18n"])
      assert.equal(dependencies[`@mdbase-dev/${name}`], "0.1.0-beta.158");
    assert.equal(dependencies["@mdbase-dev/sdk"], "0.1.0-beta.159");
    for (const target of ["lab", "staging"]) {
      const archive = new URL(
        `../../apps/${app}/${dependencies[`@mdbase-dev/sdk-${target}`].slice(5)}`,
        import.meta.url,
      );
      const pkg = JSON.parse(
        execFileSync("tar", ["-xOzf", archive.pathname, "package/package.json"]),
      );
      assert.equal(pkg.name, `@mdbase-dev/sdk-${target}`);
      assert.equal(pkg.version, dependencies["@mdbase-dev/sdk"]);
    }
  }
});
