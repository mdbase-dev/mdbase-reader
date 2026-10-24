import { MdbaseError, type Issue } from "@mdbase-dev/sdk";
import { describe, expect, it } from "vitest";

import { failure } from "./native/native-mapping.js";
import { ConnectRepositoryError, outcomeValue } from "./repository-client.js";
import { validationIssueSummary } from "./validation-issues.js";

function required(field: string): Issue {
  return {
    code: "schema_required",
    severity: "error",
    message: `required property \`${field}\` is missing`,
    details: new Map([["schema_location", "/required"]]),
  };
}

function rejection(issues?: Issue[]): MdbaseError {
  return new MdbaseError({
    code: "invalid_record",
    recovery: "fix_request",
    message: "`sources/parts/chapter.md` would not be valid",
    ...(issues ? { issues } : {}),
  });
}

describe("record validation rejections", () => {
  it.each([
    "create source",
    "update source",
    "create chapter source",
    "create annotation",
    "update annotation",
    "save citation metadata",
  ])("retains typed issues and explains failures to %s", (operation) => {
    const issues = [required("saved_at")];
    const outcome = failure(rejection(issues));
    try {
      outcomeValue(outcome, operation);
      expect.fail("The invalid record must be rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(ConnectRepositoryError);
      const repositoryError = error as ConnectRepositoryError;
      expect(repositoryError.issues).toBe(issues);
      expect(repositoryError.issues[0]?.details).toEqual(
        new Map([["schema_location", "/required"]]),
      );
      expect(repositoryError.problem).toBe(outcome.ok ? null : outcome.problem);
      expect(repositoryError.message).toBe(
        `mdbase Connect could not ${operation}: \`sources/parts/chapter.md\` would not be valid: Saved date is required`,
      );
    }
  });

  it("ignores warnings, deduplicates, and caps the summary at three distinct issues", () => {
    expect(
      validationIssueSummary([
        { ...required("warning_only"), severity: "warning" },
        required("saved_at"),
        required("saved_at"),
        required("custom_key"),
        required("title"),
        required("source"),
        required("created_at"),
      ]),
    ).toBe("Saved date is required; custom_key is required; Title is required; and 2 more issues");
  });

  it("never displays arbitrary messages, details, record values, or source dumps", () => {
    const secret = "https://user:password@example.org/?token=secret\n---\nprivate source content";
    const issues: Issue[] = [
      {
        code: "schema_type",
        severity: "error",
        message: secret,
        details: new Map([
          ["field", "title"],
          ["record", secret],
        ]),
      },
      { code: "future_code", severity: "error", message: secret, details: secret },
      required(secret),
    ];
    expect(validationIssueSummary(issues)).toBe(
      "Title has the wrong type; A field does not meet its validation rules; A field is required",
    );
  });

  it("keeps nested friendly labels and unknown field keys without serializing CBOR details", () => {
    expect(
      validationIssueSummary([
        {
          code: "format_invalid",
          severity: "error",
          message: "private value",
          details: new Map([["location", "/csl/DOI"]]),
        },
        required("custom_key"),
      ]),
    ).toBe("DOI does not match the required format; custom_key is required");
  });

  it.each([undefined, [], [{ ...required("saved_at"), severity: "warning" as const }]])(
    "preserves the existing message without error-severity issues (%j)",
    (issues) => {
      expect(() => outcomeValue(failure(rejection(issues)), "create chapter source")).toThrow(
        "mdbase Connect could not create chapter source: `sources/parts/chapter.md` would not be valid",
      );
    },
  );

  it("treats inherited object names as unknown field keys and issue codes", () => {
    expect(
      validationIssueSummary([
        required("constructor"),
        { code: "__proto__", severity: "error", message: "private content" },
      ]),
    ).toBe("constructor is required; A field does not meet its validation rules");
  });

  it("preserves unrelated errors and successful values", () => {
    expect(() => outcomeValue(failure(new Error("Connection failed")), "update source")).toThrow(
      "mdbase Connect could not update source: Connection failed",
    );
    expect(outcomeValue({ ok: true, value: 42, diagnostics: [] }, "create source")).toBe(42);
  });
});
