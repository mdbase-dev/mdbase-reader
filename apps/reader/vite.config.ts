import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import type { Plugin } from "vite";

const buildId = (process.env["MDBASE_READER_BUILD_ID"] ?? "local").replaceAll(
  /[^a-zA-Z0-9_-]/g,
  "-",
);

export default defineConfig({
  plugins: [react(), deploymentRevision(buildId)],
  build: {
    sourcemap: true,
    target: "es2022",
    rolldownOptions: {
      output: {
        entryFileNames: `assets/[name]-[hash]-${buildId}.js`,
        chunkFileNames: `assets/[name]-[hash]-${buildId}.js`,
        assetFileNames: `assets/[name]-[hash]-${buildId}.[ext]`,
      },
    },
  },
});

function deploymentRevision(revision: string): Plugin {
  return {
    name: "mdbase-reader-deployment-revision",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: ".well-known/mdbase-reader-build.json",
        source: `${JSON.stringify({ revision })}\n`,
      });
    },
  };
}
