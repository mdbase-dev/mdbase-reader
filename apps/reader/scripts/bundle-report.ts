import { brotliCompressSync, gzipSync } from "node:zlib";

import type { Plugin } from "vite";

/** Opt-in build analysis; dot-directory output is not part of the offline shell. */
export function bundleReport(): Plugin {
  return {
    name: "reader-bundle-report",
    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle).flatMap((output) =>
        output.type === "chunk"
          ? [
              {
                file: output.fileName,
                entry: output.isEntry,
                imports: output.imports,
                dynamicImports: output.dynamicImports,
                raw: Buffer.byteLength(output.code),
                gzip: gzipSync(output.code).byteLength,
                brotli: brotliCompressSync(output.code).byteLength,
                modules: Object.entries(output.modules).map(([id, module]) => ({
                  id: id.replaceAll(process.cwd(), "."),
                  rendered: module.renderedLength,
                })),
              },
            ]
          : [],
      );
      this.emitFile({
        type: "asset",
        fileName: ".vite/reader-bundle.json",
        source: JSON.stringify(chunks, null, 2),
      });
    },
  };
}
