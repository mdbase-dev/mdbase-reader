import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { createServer } from "vite";

const root = resolve(import.meta.dirname, "..");
const server = await createServer({
  root,
  server: { host: "127.0.0.1", port: 0, strictPort: true },
});
try {
  await server.listen();
  const address = server.httpServer.address();
  if (!address || typeof address === "string")
    throw new Error("Audit server did not bind a loopback port");
  const origin = `http://127.0.0.1:${address.port}`;
  await run("audit-pdf-touch-handles.mjs", { READER_AUDIT_ORIGIN: origin });
  await run("audit-reader.mjs", {
    READER_AUDIT_ORIGIN: origin,
    READER_AUDIT_PDF_TOUCH_ONLY: "1",
    READER_AUDIT_FORMATS_ONLY: "0",
    READER_AUDIT_READING_ONLY: "0",
    READER_AUDIT_SHARED_EDITING_ONLY: "0",
    READER_AUDIT_RESPONSIVE_ONLY: "0",
    READER_AUDIT_SIDEBARS_ONLY: "0",
    READER_AUDIT_ANNOTATIONS_ONLY: "0",
  });
} finally {
  await server.close();
}

async function run(script, environment) {
  const child = spawn(process.execPath, [resolve(import.meta.dirname, script)], {
    cwd: root,
    env: { ...process.env, ...environment },
    stdio: "inherit",
    timeout: 180_000,
  });
  const code = await new Promise((resolveExit, reject) => {
    child.once("error", reject);
    child.once("exit", resolveExit);
  });
  if (code !== 0) throw new Error(`${script} failed or timed out (exit ${String(code)})`);
}
