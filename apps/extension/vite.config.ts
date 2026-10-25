import { resolve } from "node:path";

import react from "@vitejs/plugin-react";
import { build, defineConfig, type Plugin, type UserConfig } from "vite";

import { extensionEnvironment, extensionManifest } from "./scripts/extension-manifest.mjs";
import { extensionSdk } from "./scripts/extension-sdk.mjs";

const environment = extensionEnvironment();

type SdkAliases = Awaited<ReturnType<typeof extensionSdk>>["aliases"];

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
 * The service worker's classic scripts, built after the pages as self-contained IIFEs so
 * they share no chunks with them: background.js, and page-status.js, which it loads with
 * importScripts() only when a page may be saved (see src/page-status-loader.ts). Neither
 * includes the SDK, which runs in the offscreen host (src/offscreen.ts).
 */
function serviceWorker(alias: SdkAliases): Plugin {
  const scripts = {
    background: "src/background.ts",
    "page-status": "src/page-status-worker.ts",
    "social-page": "src/social-page.ts",
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
          resolve: { alias },
          define: { __READER_EXTENSION_ENVIRONMENT__: JSON.stringify(environment) },
          build: {
            target: "es2022",
            sourcemap: true,
            outDir: "dist",
            emptyOutDir: false,
            copyPublicDir: false,
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

export default defineConfig(async (): Promise<UserConfig> => {
  // Verified before any SDK code runs; every canonical SDK import, including those from
  // Connect and UI, resolves to this environment's original.
  const sdk = await extensionSdk();
  return {
    plugins: [react(), manifest(), serviceWorker(sdk.aliases)],
    resolve: { alias: sdk.aliases },
    // The SDK starts its own module Worker from a module-relative URL; keep it out of
    // dev pre-bundling so that URL still names the SDK's files, and emit ES workers.
    optimizeDeps: { exclude: ["@mdbase-dev/sdk"] },
    worker: {
      format: "es",
      rolldownOptions: {
        output: {
          entryFileNames: "assets/[name]-[hash].js",
          chunkFileNames: "assets/[name]-[hash].js",
          assetFileNames: "assets/[name]-[hash][extname]",
        },
      },
    },
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
          offscreen: resolve(import.meta.dirname, "offscreen.html"),
        },
        output: {
          entryFileNames: "assets/[name]-[hash].js",
          chunkFileNames: "assets/[name]-[hash].js",
          assetFileNames: "assets/[name]-[hash][extname]",
        },
      },
    },
  };
});
