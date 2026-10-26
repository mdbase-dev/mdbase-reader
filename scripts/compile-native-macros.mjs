import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { transformAsync } from "@babel/core";

// tsc owns native module layout and declarations; Babel removes compile-time
// Lingui macros from emitted JS. Never ship a runtime import of /macro.
async function compile(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      await compile(path);
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      const source = await readFile(path, "utf8");
      if (!source.includes("@lingui/") || !source.includes("/macro")) continue;
      const output = await transformAsync(source, {
        filename: path,
        babelrc: false,
        configFile: false,
        plugins: ["@lingui/babel-plugin-lingui-macro"],
        sourceMaps: true,
      });
      if (!output?.code) throw new Error(`No macro output for ${path}`);
      await writeFile(path, `${output.code}\n//# sourceMappingURL=${entry.name}.map\n`);
      await writeFile(`${path}.map`, JSON.stringify(output.map));
    }
  }
}
await compile(resolve(process.argv[2] ?? "dist"));
