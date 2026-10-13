import { offlineShellPlugin } from "@mdbase-dev/sdk/offline-shell/build";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import type { Plugin } from "vite";

const buildId = (process.env["MDBASE_READER_BUILD_ID"] ?? "local").replaceAll(
  /[^a-zA-Z0-9_-]/g,
  "-",
);

const buildOutput = {
  entryFileNames: `assets/[name]-[hash]-${buildId}.js`,
  chunkFileNames: `assets/[name]-[hash]-${buildId}.js`,
  assetFileNames: `assets/[name]-[hash]-${buildId}.[ext]`,
};

export default defineConfig({
  plugins: [react(), deploymentRevision(buildId), offlineShellPlugin()],
  resolve: {
    dedupe: [
      "react",
      "react-dom",
      "@codemirror/autocomplete",
      "@codemirror/commands",
      "@codemirror/language",
      "@codemirror/lint",
      "@codemirror/search",
      "@codemirror/state",
      "@codemirror/view",
    ],
  },
  // The SDK starts its own module Worker from a module-relative URL; keep it out of
  // dev pre-bundling so that URL still names the SDK's files, and emit ES workers.
  optimizeDeps: { exclude: ["@mdbase-dev/sdk"] },
  // Workers share the build-tagged names, so the SDK's native assets are emitted once.
  worker: { format: "es", rolldownOptions: { output: buildOutput } },
  build: {
    sourcemap: true,
    target: "es2022",
    rolldownOptions: {
      output: buildOutput,
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
