import { resolve } from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

import { extensionEnvironment, extensionManifest } from "./scripts/extension-manifest.mjs";

const environment = extensionEnvironment();

function manifest(): Plugin {
  return {
    name: "mdbase-reader-extension-manifest",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "manifest.json",
        source: `${JSON.stringify(extensionManifest(environment), null, 2)}\n`,
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), manifest()],
  define: { __READER_EXTENSION_ENVIRONMENT__: JSON.stringify(environment) },
  build: {
    target: "es2022",
    sourcemap: true,
    outDir: "dist",
    emptyOutDir: true,
    rolldownOptions: {
      input: {
        capture: resolve(import.meta.dirname, "capture.html"),
        options: resolve(import.meta.dirname, "options.html"),
        welcome: resolve(import.meta.dirname, "welcome.html"),
        background: resolve(import.meta.dirname, "src/background.ts"),
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === "background" ? "background.js" : "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
