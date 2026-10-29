import { resolve } from "node:path";

import { lingui } from "@lingui/vite-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [lingui({ macroTransform: true })],
  test: {
    setupFiles: [resolve(import.meta.dirname, "scripts/test-i18n.mjs")],
    // happy-dom 21 leaves iframes without documents unless page loading is enabled.
    environmentOptions: { happyDOM: { settings: { enableIframePageLoading: true } } },
  },
});
