import { collectionId, sourceId } from "@mdbase-reader/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConnectAnnotationRepository } from "../annotation-repository.js";
import { resolveAnnotationSource } from "../annotation-source.js";

import { MemoryReplica } from "./testing.js";

import type { MdbaseClient } from "@mdbase-dev/sdk";

const clients: MdbaseClient[] = [];
afterEach(() => {
  for (const client of clients.splice(0)) {
    client.close();
  }
});

/** A replica whose link resolver is the SDK's own; any query filter or link projection fails. */
async function library(): Promise<{ replica: MemoryReplica; client: MdbaseClient }> {
  const replica = new MemoryReplica({
    confirmDelayMs: 0,
    where: (expr) => {
      throw new Error(`Unexpected query filter: ${expr}`);
    },
  });
  const client = await replica.client();
  clients.push(client);
  const pages = client.pages.bind(client);
  vi.spyOn(client, "pages").mockImplementation((query, options) => {
    if (JSON.stringify(query).includes("asFile")) {
      throw new Error(`Unexpected link-following query: ${JSON.stringify(query)}`);
    }
    return pages(query, options);
  });
  for (const [name, id] of [
    ["book", "src_book"],
    ["other", "src_other"],
  ] as const) {
    replica.seed({
      path: `sources/${name}.md`,
      types: ["reader-source"],
      frontmatter: { type: "reader-source", id, title: name },
    });
  }
  const annotation = (path: string, source: string): void => {
    replica.seed({
      path,
      types: ["reader-annotation"],
      frontmatter: {
        type: "reader-annotation",
        id: `ann_${path.split("/").pop()!.replace(/\.md$/u, "")}`,
        source,
        annotation_type: "note",
        created_at: "2026-11-15T00:00:00Z",
      },
      body: `Note at ${path}`,
    });
  };
  annotation("annotations/by-path.md", "[[sources/book|Book]]");
  annotation("annotations/by-name.md", "[[book]]");
  annotation("annotations/legacy.md", "src_book");
  annotation("annotations/to-other.md", "[[other]]");
  // Resolved against its own folder: a relative link from another folder.
  annotation("elsewhere/relative.md", "[[../sources/other]]");
  return { replica, client };
}

describe("annotation sources through the replica's link resolver", () => {
  it("counts each source's annotations with one resolver request per folder", async () => {
    const { client } = await library();
    const resolveLinks = vi.spyOn(client, "resolveLinks");

    const counts = await new ConnectAnnotationRepository(client).annotationCountsBySource(
      collectionId("reading"),
    );

    expect(counts).toEqual(
      new Map([
        [sourceId("src_book"), 3],
        [sourceId("src_other"), 2],
      ]),
    );
    expect(new Set(resolveLinks.mock.calls.map(([from]) => from.split("/")[0]))).toEqual(
      new Set(["annotations", "elsewhere"]),
    );
    expect(resolveLinks).toHaveBeenCalledTimes(2);
  });

  it("lists every annotation with its resolved source", async () => {
    const { client } = await library();

    const listed = await new ConnectAnnotationRepository(client).listAll(collectionId("reading"));

    expect(new Map(listed.map((item) => [item.id, item.sourceId]))).toEqual(
      new Map([
        ["ann_by-path", "src_book"],
        ["ann_by-name", "src_book"],
        ["ann_legacy", "src_book"],
        ["ann_to-other", "src_other"],
        ["ann_relative", "src_other"],
      ]),
    );
  });

  it("resolves one annotation's source where its link is written", async () => {
    const { client } = await library();

    await expect(resolveAnnotationSource(client, "elsewhere/relative.md")).resolves.toBe(
      "src_other",
    );
  });
});
