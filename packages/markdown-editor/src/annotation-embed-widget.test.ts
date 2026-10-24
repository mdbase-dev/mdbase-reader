// @vitest-environment happy-dom
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";

import { annotationEditorExtensions } from "./annotation-widgets.js";

import type { WikiLinkCandidate } from "./completions.js";

const comment: WikiLinkCandidate = {
  path: "annotations/ann_01",
  label: "Memory is reconstructive",
  kind: "comment",
  detail: "p. 12",
  note: "Memory is reconstructive",
  embed: true,
};

describe("embedded annotations", () => {
  let view: EditorView | undefined;
  afterEach(() => {
    view?.destroy();
    view = undefined;
  });

  const open = (doc: string): HTMLElement => {
    view = new EditorView({
      state: EditorState.create({
        doc,
        // Keep the cursor outside the embed, where it shows as a card.
        selection: { anchor: doc.length },
        extensions: annotationEditorExtensions(
          [comment],
          [],
          () => undefined,
          () => undefined,
          undefined,
          undefined,
        ),
      }),
      parent: document.body,
    });
    return view.dom;
  };

  it("shows an embed as a card without its raw file path", () => {
    const card = open("Intro\n\n![[annotations/ann_01]]\n\nEnd").querySelector(
      ".cm-annotation-embed",
    );

    expect(card?.textContent).not.toContain("annotations/ann_01");
    expect(
      [...(card?.querySelectorAll("button") ?? [])].map((button) => button.textContent),
    ).toEqual(["Edit embed", "Edit annotation", "Open in document"]);
  });

  it("describes a missing embedded annotation without its path", () => {
    const link = open("Intro\n\n![[annotations/gone]]\n\nEnd").querySelector(".is-unresolved");

    expect(link?.getAttribute("title")).toBe("Linked annotation is missing");
  });
});
