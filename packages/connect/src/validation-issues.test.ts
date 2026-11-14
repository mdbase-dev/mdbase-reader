import { MdbaseError, type Issue, describeError } from "@mdbase-dev/sdk";
import { describe, expect, it } from "vitest";

import { requireSaved } from "./repository-client.js";
import { validationIssueSummary } from "./validation-issues.js";

function required(field: string): Issue {
  return {
    code: "schema_required",
    severity: "error",
    message: `required property \`${field}\` is missing`,
    details: { schema_location: "/required" },
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
  it("retains native issues while the SDK describes the problem safely", () => {
    const issues = [required("saved_at")];
    try {
      requireSaved({ outcome: "rejected", problem: rejection(issues).toProblem() });
      expect.fail("Expected rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(MdbaseError);
      expect((error as MdbaseError).issues).toBe(issues);
      expect(describeError(error)?.message).not.toContain("sources/parts/chapter.md");
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
        details: { schema_location: "/properties/title/type", record: secret },
      },
      { code: "future_code", severity: "error", message: secret, details: secret },
      required(secret),
    ];
    expect(validationIssueSummary(issues)).toBe(
      "Title has the wrong type; A field does not meet its validation rules; A field is required",
    );
  });

  it("keeps nested friendly labels and unknown field keys without serializing details", () => {
    expect(
      validationIssueSummary([
        {
          code: "format_invalid",
          severity: "error",
          message: "private value",
          details: { schema_location: "/properties/csl/properties/DOI/pattern" },
        },
        required("custom_key"),
        {
          ...required("status"),
          details: { schema_location: "/properties/reading/required" },
        },
      ]),
    ).toBe(
      "DOI does not match the required format; custom_key is required; Reading status is required",
    );
  });

  it("treats inherited object names as unknown field keys and issue codes", () => {
    expect(
      validationIssueSummary([
        required("constructor"),
        { code: "__proto__", severity: "error", message: "private content" },
      ]),
    ).toBe("constructor is required; A field does not meet its validation rules");
  });
});
