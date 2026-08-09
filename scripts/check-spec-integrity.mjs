import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const expected = new Map([
  ["SPEC.md", "c17d7a886bfbb5ddd2195fca44e2f4d0e6c4ce962220f4851923c4ca77948af2"],
  ["DATA_MODEL.md", "d0ccbe66c442dbbf1cfbc48e3e47a0d17ca19cf81df5864ce4a453bdeccc9156"],
]);

for (const [path, expectedHash] of expected) {
  const contents = await readFile(new URL(`../${path}`, import.meta.url));
  const actualHash = createHash("sha256").update(contents).digest("hex");
  if (actualHash !== expectedHash) {
    throw new Error(
      `${path} changed unexpectedly: expected ${expectedHash}, received ${actualHash}`,
    );
  }
}

console.log("Specification integrity verified.");
