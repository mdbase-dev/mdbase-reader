import { resolve } from "node:path";

import react from "@vitejs/plugin-react";
import { build, defineConfig, type Plugin } from "vite";

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

/**
 * The service worker is two classic scripts: background.js, which runs on every wake, and
 * page-status.js with the Connect SDK, which it loads with importScripts() only when a
 * page may be saved (see src/page-status-loader.ts). Each is a self-contained IIFE, built
 * after the pages so neither shares chunks with them.
 */
function serviceWorker(): Plugin {
  const scripts = {
    background: "src/background.ts",
    "page-status": "src/page-status-worker.ts",
  };
  return {
    name: "mdbase-reader-extension-service-worker",
    apply: "build",
    async closeBundle() {
      for (const [name, entry] of Object.entries(scripts)) {
        await build({
          configFile: false,
          root: import.meta.dirname,
          logLevel: "warn",
          define: { __READER_EXTENSION_ENVIRONMENT__: JSON.stringify(environment) },
          build: {
            target: "es2022",
            sourcemap: true,
            outDir: "dist",
            emptyOutDir: false,
            copyPublicDir: false,
            // Connect's lazily loaded modules are inlined: workers cannot import() them.
            modulePreload: false,
            rolldownOptions: {
              input: resolve(import.meta.dirname, entry),
              // Vite's preload helper mentions import.meta; with modulePreload off it is unused.
              onwarn(warning, warn) {
                if (warning.code !== "EMPTY_IMPORT_META") {
                  warn(warning);
                }
              },
              // Core's modules only declare things; let the small worker bundle take
              // `normalizedSourceUrl` without the citation schema evaluated beside it.
              ...(name === "background"
                ? {
                    treeshake: {
                      moduleSideEffects: (id: string) => !id.includes("/packages/core/"),
                    },
                  }
                : {}),
              output: { format: "iife", entryFileNames: `${name}.js` },
            },
          },
        });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), manifest(), serviceWorker()],
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
      },
      output: {
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
