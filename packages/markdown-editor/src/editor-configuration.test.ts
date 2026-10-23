import { history, undo, undoDepth } from "@codemirror/commands";
import { Compartment, EditorState } from "@codemirror/state";
import { englishCodeMirrorPhrases, loadCodeMirrorPhrases } from "@mdbase-dev/i18n/codemirror";
import { describe, expect, it } from "vitest";

import { editorConfiguration } from "./editor-configuration.js";

const configuration = (
  phrases: Readonly<Record<string, string>>,
): ReturnType<typeof editorConfiguration> =>
  editorConfiguration({
    phrases,
    ariaLabel: "User note",
    language: "markdown",
    profile: "prose",
    placeholder: undefined,
    readOnly: false,
    onSave: undefined,
  });

describe("shared CodeMirror phrase reconfiguration", () => {
  it("changes phrases without resetting the document, selection or undo history", async () => {
    const compartment = new Compartment();
    let state = EditorState.create({
      doc: "User text",
      extensions: [history(), compartment.of(configuration(englishCodeMirrorPhrases))],
    });
    state = state.update({ changes: { from: 9, insert: "!" }, selection: { anchor: 10 } }).state;
    const selection = state.selection;
    const depth = undoDepth(state);
    const french = await loadCodeMirrorPhrases("fr");
    state = state.update({ effects: compartment.reconfigure(configuration(french)) }).state;
    expect(state.phrase("Find")).toBe(french["Find"]);
    expect(state.doc.toString()).toBe("User text!");
    expect(state.selection).toEqual(selection);
    expect(undoDepth(state)).toBe(depth);
    expect(
      undo({
        state,
        dispatch: (transaction) => {
          state = transaction.state;
        },
      }),
    ).toBe(true);
    expect(state.doc.toString()).toBe("User text");
    state = state.update({
      effects: compartment.reconfigure(configuration(englishCodeMirrorPhrases)),
    }).state;
    expect(state.phrase("Find")).toBe("Find");
  });
});
