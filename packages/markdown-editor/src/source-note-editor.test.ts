// @vitest-environment happy-dom
import { highlightingFor } from "@codemirror/language";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { expect, it, vi } from "vitest";

import { annotationEditorExtensions } from "./annotation-widgets.js";
import { editorConfiguration } from "./editor-configuration.js";

it("renders source-note headings and references without crashing the syntax highlighter", () => {
  const exception = vi.fn();
  const references = new Compartment();
  const view = new EditorView({
    parent: document.body,
    state: EditorState.create({
      doc: "## Notes\n\n[[sources/example]]\n\n[@example]\n\nEnd",
      extensions: [
        EditorView.exceptionSink.of(exception),
        editorConfiguration({
          ariaLabel: "Source note",
          language: "markdown",
          profile: "prose",
          placeholder: undefined,
          readOnly: false,
          onSave: undefined,
        }),
        references.of([]),
      ],
    }),
  });
  try {
    // Reference candidates arrive in an effect after the editor view mounts.
    view.dispatch({
      effects: references.reconfigure(
        annotationEditorExtensions(
          [{ path: "sources/example", label: "Example Domain" }],
          [{ id: "example", label: "Example Domain" }],
          undefined,
          undefined,
          undefined,
          undefined,
        ),
      ),
    });
    expect(exception.mock.calls).toEqual([]);
    const headingClass = highlightingFor(view.state, [tags.heading]);
    expect(headingClass).not.toBeNull();
    expect(
      [...view.dom.querySelectorAll(`.${headingClass}`)].map((span) => span.textContent).join(""),
    ).toBe("## Notes");
    expect(view.dom.querySelector(".cm-wikilink.is-resolved")?.textContent).toBe(
      "[[sources/example]]",
    );
    expect(view.dom.querySelector(".cm-citation-reference")?.textContent).toBe("Example Domain");
  } finally {
    view.destroy();
  }
});
