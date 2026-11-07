import { connect, type Connector, type FramePort } from "@mdbase-dev/sdk";
import { MemoryReplica } from "@mdbase-dev/sdk/testing";
import { expect, it } from "vitest";

it.each([false, true])("SDK Stop releases the commit lane with captured=%s", async (captured) => {
  const replica = new MemoryReplica({ confirmDelayMs: null });
  const base = replica.connector();
  let reachedCommit!: () => void;
  const committing = new Promise<void>((resolve) => {
    reachedCommit = resolve;
  });
  let active = false;
  let commits = 0;
  let aborted = 0;
  let blocked: unknown;
  const connector: Connector = {
    description: base.description,
    async open(hello, signal) {
      const opened = await base.open(hello, signal);
      const port: FramePort = {
        onframe: null,
        onclose: null,
        close: () => opened.port.close(),
        send(frame) {
          const fields: ReadonlyMap<number | string, unknown> | null =
            frame instanceof Map ? frame : null;
          if (fields?.get(0) === 0) {
            const method = fields.get(2);
            if (method === "open_upload") {
              expect(active, "the previous upload must release its lane").toBe(false);
              active = true;
            }
            if (method === "abort_upload") {
              active = false;
              aborted += 1;
            }
            if (method === "commit_upload" && commits++ === 0) {
              blocked = fields.get(1);
              if (captured) {
                opened.port.send(frame);
              }
              reachedCommit();
              return;
            }
          }
          opened.port.send(frame);
        },
      };
      opened.port.onframe = (frame) => {
        const fields: ReadonlyMap<number | string, unknown> | null =
          frame instanceof Map ? frame : null;
        if (fields?.get(0) === 1 && fields.get(1) === blocked) {
          return;
        }
        port.onframe?.(frame);
      };
      opened.port.onclose = (error) => port.onclose?.(error);
      return { ...opened, port };
    },
  };
  const client = await connect({
    connector,
    app: { name: "reader-stop", version: "test" },
    reconnect: false,
  });
  try {
    const stop = new AbortController();
    const first = client.files.upload("files/stopped.bin", new Uint8Array([1, 2]), {
      signal: stop.signal,
    });
    const outcome = expect(first).rejects.toMatchObject({ code: "cancelled" });
    await committing;
    stop.abort();
    await outcome;
    expect(aborted).toBe(1);
    const second = await client.files.upload("files/fresh.bin", new Uint8Array([3, 4]));
    replica.confirmAll();
    await second.confirmed;
    const files = [];
    for await (const file of client.files.list()) {
      files.push(file.path);
    }
    expect(files.toSorted((left, right) => left.localeCompare(right))).toEqual(
      captured ? ["files/fresh.bin", "files/stopped.bin"] : ["files/fresh.bin"],
    );
  } finally {
    client.close();
  }
});
