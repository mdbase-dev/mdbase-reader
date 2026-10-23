import { i18n, type MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { afterEach, describe, expect, it } from "vitest";

import "./i18n.js";
import { annotationColumnLabel } from "./annotation-columns.js";
import { cslFieldLabel } from "./citation-form-model.js";
import { connectionProblemDetail, describeConnectionProblem } from "./connection-recovery.js";
import { columnLabel, formatPropertyValue, propertySortValue } from "./library-columns.js";
import { signInCopy } from "./native-signin-ui.js";
import { readerCommandGroupLabel } from "./reader-command-list.js";

function id(message: MessageDescriptor): string {
  if (!message.id) {
    throw new Error("Expected an extracted message ID");
  }
  return message.id;
}

afterEach(() => {
  i18n.activate("en");
});

describe("Reader model copy uses the active real Lingui catalogue", () => {
  it("updates lazy labels while preserving user labels and stable sort values", () => {
    expect(columnLabel("title")).toBe("Title");
    expect(annotationColumnLabel("passage")).toBe("Passage");
    i18n.load("fr", {
      [id(msg({ message: "Title", context: "Library table column" }))]: "Titre",
      [id(msg({ message: "Passage", context: "Annotation table column" }))]: "Extrait",
      [id(msg({ message: "Yes", context: "library columns" }))]: "Oui",
      [id(msg({ message: "Sign in", context: "Native sign-in" }))]: "Se connecter",
      [id(msg`Workspace`)]: "Espace de travail",
      [id(
        msg({
          message: "Original publisher place",
          context: "CSL bibliographic field or item type",
        }),
      )]: "Lieu de publication original",
    });
    i18n.activate("fr");
    expect(columnLabel("title")).toBe("Titre");
    expect(annotationColumnLabel("passage")).toBe("Extrait");
    expect(columnLabel("property:course", [{ key: "course", label: "My course" }])).toBe(
      "My course",
    );
    expect(formatPropertyValue(true)).toBe("Oui");
    expect(propertySortValue(true)).toBe("true");
    expect(signInCopy.signIn).toBe("Se connecter");
    expect(readerCommandGroupLabel("Workspace")).toBe("Espace de travail");
    expect(cslFieldLabel("original-publisher-place")).toBe("Lieu de publication original");
    expect(cslFieldLabel("DOI")).toBe("DOI");
    expect(cslFieldLabel("custom_field")).toBe("custom_field");
  });

  it("retains original diagnostics even when translated display text happens to match", () => {
    const diagnostic = "Failed to fetch";
    i18n.load("fr", {
      [id(
        msg({
          message: "Reader could not reach mdbase Connect. Check your connection, then try again.",
        }),
      )]: diagnostic,
    });
    i18n.activate("fr");
    expect(describeConnectionProblem(diagnostic)).toBe(diagnostic);
    expect(connectionProblemDetail(diagnostic)).toBe(diagnostic);
    expect(connectionProblemDetail("unrecognized authority diagnostic")).toBeNull();
  });
});
