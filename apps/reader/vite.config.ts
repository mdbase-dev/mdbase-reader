import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const buildId = (process.env["MDBASE_READER_BUILD_ID"] ?? "local").replaceAll(
  /[^a-zA-Z0-9_-]/g,
  "-",
);

export default defineConfig({
  plugins: [react()],
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
