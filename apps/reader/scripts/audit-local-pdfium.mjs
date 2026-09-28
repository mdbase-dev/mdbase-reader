import { createRequire } from "node:module";
import { dirname, join } from "node:path";

// Use the WASM shipped with the locked viewer dependency, not the public CDN, in audits.
// This changes test routing only; production continues to use the viewer's normal loader.
export async function installLocalPdfium(context) {
  const require = createRequire(
    new URL("../../../packages/renderer-pdf/package.json", import.meta.url),
  );
  const viewer = require.resolve("@embedpdf/react-pdf-viewer");
  const snippet = createRequire(viewer).resolve("@embedpdf/snippet");
  const wasm = join(dirname(snippet), "pdfium.wasm");
  await context.route(
    /^https:\/\/cdn\.jsdelivr\.net\/npm\/@embedpdf\/pdfium@[^/]+\/dist\/pdfium\.wasm$/,
    (route) => route.fulfill({ path: wasm, contentType: "application/wasm" }),
  );
}
