import assert from "node:assert/strict";
import test from "node:test";
import { unexpectedShellFailures } from "./pages-offline-requests.mjs";

test("only tolerates worker HTML redirect probes during online shell startup", () => {
  const origin = "https://reader.example";
  const probe = { url: origin + "/index.html", worker: true, error: "net::ERR_FAILED" };
  const unexpected = [
    { ...probe, worker: false },
    { ...probe, url: origin + "/" },
    { ...probe, url: origin + "/assets/reader.js" },
    { ...probe, url: origin + "/index.html?q=1" },
    { ...probe, error: "net::ERR_INTERNET_DISCONNECTED" },
  ];
  assert.deepEqual(
    unexpectedShellFailures(
      [probe, { ...probe, url: origin + "/404.html" }, ...unexpected],
      origin,
    ),
    unexpected,
  );
});
