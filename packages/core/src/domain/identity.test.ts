import { describe, expect, it } from "vitest";

import { DomainError } from "./errors.js";
import {
  annotationId,
  collectionId,
  fileId,
  mutationId,
  recordRevision,
  sourceId,
} from "./identity.js";
import { fileRevision } from "./revision.js";
import { dateTime } from "./time.js";

describe("domain scalar constructors", () => {
  it("normalizes stable identities at the boundary", () => {
    expect(collectionId(" collection ")).toBe("collection");
    expect(sourceId("source")).toBe("source");
    expect(annotationId("annotation")).toBe("annotation");
    expect(fileId("file")).toBe("file");
    expect(mutationId("mutation")).toBe("mutation");
    expect(recordRevision("record-r1")).toBe("record-r1");
  });

  it("rejects blank and control-character identities", () => {
    expect(() => sourceId("  ")).toThrow(DomainError);
    expect(() => sourceId("source\u0000id")).toThrow(DomainError);
  });

  it("normalizes and validates file hashes", () => {
    expect(fileRevision(" SHA256:A8CA22 ")).toBe("sha256:a8ca22");
    expect(() => fileRevision("revision-1")).toThrow(DomainError);
  });

  it("accepts ISO datetimes and rejects informal dates", () => {
    expect(dateTime("2026-08-09T15:18:00+10:00")).toBe("2026-08-09T15:18:00+10:00");
    expect(() => dateTime("tomorrow")).toThrow(DomainError);
  });
});
