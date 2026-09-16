import type { EditorState, StateCommand } from "@codemirror/state";

export type MarkdownCommandName =
  "strong" | "emphasis" | "link" | "heading" | "quote" | "bullet-list" | "inline-code";

export interface MarkdownCommandRequest {
  readonly requestId: number;
  readonly name: MarkdownCommandName;
}

export interface MarkdownEdit {
  readonly from: number;
  readonly to: number;
  readonly insert: string;
  readonly anchor: number;
  readonly head?: number;
}

export function markdownEdit(
  document: string,
  anchor: number,
  head: number,
  name: MarkdownCommandName,
): MarkdownEdit {
  const from = Math.min(anchor, head);
  const to = Math.max(anchor, head);
  if (name === "heading") {
    return toggleLinePrefix(document, from, to, "## ");
  }
  if (name === "quote") {
    return toggleLinePrefix(document, from, to, "> ");
  }
  if (name === "bullet-list") {
    return toggleLinePrefix(document, from, to, "- ");
  }
  if (name === "link") {
    return linkEdit(document, from, to);
  }
  return delimitedEdit(
    document,
    from,
    to,
    name === "strong" ? "**" : name === "emphasis" ? "_" : "`",
  );
}

export function markdownCommand(name: MarkdownCommandName): StateCommand {
  return ({ state, dispatch }) => {
    const selection = state.selection.main;
    const edit = markdownEdit(state.doc.toString(), selection.anchor, selection.head, name);
    dispatch(
      state.update({
        changes: { from: edit.from, to: edit.to, insert: edit.insert },
        selection: { anchor: edit.anchor, head: edit.head ?? edit.anchor },
        scrollIntoView: true,
        userEvent: `input.markdown.${name}`,
      }),
    );
    return true;
  };
}

export function documentText(state: EditorState): string {
  return state.doc.toString();
}

function delimitedEdit(
  document: string,
  from: number,
  to: number,
  delimiter: string,
): MarkdownEdit {
  const selected = document.slice(from, to);
  if (selected && selected.startsWith(delimiter) && selected.endsWith(delimiter)) {
    const insert = selected.slice(delimiter.length, -delimiter.length);
    return { from, to, insert, anchor: from, head: from + insert.length };
  }
  if (!selected) {
    const insert = `${delimiter}${delimiter}`;
    return { from, to, insert, anchor: from + delimiter.length };
  }
  const insert = `${delimiter}${selected}${delimiter}`;
  return {
    from,
    to,
    insert,
    anchor: from + delimiter.length,
    head: from + delimiter.length + selected.length,
  };
}

function linkEdit(document: string, from: number, to: number): MarkdownEdit {
  const selected = document.slice(from, to);
  const label = selected || "text";
  const insert = `[${label}](url)`;
  return selected
    ? {
        from,
        to,
        insert,
        anchor: from + label.length + 3,
        head: from + label.length + 6,
      }
    : { from, to, insert, anchor: from + 1, head: from + 5 };
}

function toggleLinePrefix(
  document: string,
  selectionFrom: number,
  selectionTo: number,
  prefix: string,
): MarkdownEdit {
  const start = document.lastIndexOf("\n", Math.max(0, selectionFrom - 1)) + 1;
  const nextBreak = document.indexOf("\n", selectionTo);
  const end = nextBreak < 0 ? document.length : nextBreak;
  const lines = document.slice(start, end).split("\n");
  const remove = lines.every((line) => !line || line.startsWith(prefix));
  const insert = lines
    .map((line) => {
      if (!line) {
        return line;
      }
      if (remove) {
        return line.slice(prefix.length);
      }
      return line.startsWith(prefix) ? line : `${prefix}${line}`;
    })
    .join("\n");
  const firstAdjustment = lines[0] ? (remove ? -prefix.length : prefix.length) : 0;
  const totalAdjustment = insert.length - (end - start);
  return {
    from: start,
    to: end,
    insert,
    anchor: Math.max(start, selectionFrom + firstAdjustment),
    head: Math.max(start, selectionTo + totalAdjustment),
  };
}
