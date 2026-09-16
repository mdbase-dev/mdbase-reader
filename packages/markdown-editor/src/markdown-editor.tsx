import { useCodeEditor } from "./use-code-editor.js";

import type { CitationCompletionCandidate, WikiLinkCandidate } from "./completions.js";
import type { MarkdownCommandRequest } from "./markdown-commands.js";
import type { TextInsertionRequest } from "./text-insertion.js";
import type { JSX } from "react";

export type EditorLanguage = "markdown" | "json" | "plain";
export type EditorProfile = "prose" | "compact" | "code";

/** A synchronous record session, shared by otherwise independent editor views. */
export interface SharedTextDocument {
  readonly getText: () => string;
  readonly subscribe: (listener: () => void) => () => void;
}

export interface CodeEditorProps {
  readonly sharedDocument?: SharedTextDocument;
  readonly value: string;
  readonly ariaLabel: string;
  readonly language?: EditorLanguage;
  readonly profile?: EditorProfile;
  readonly placeholder?: string;
  readonly focusOnMount?: boolean;
  readonly readOnly?: boolean;
  readonly className?: string;
  readonly onChange: (value: string) => void;
  readonly onBlur?: () => void;
  readonly onSave?: () => void;
  readonly insertion?: TextInsertionRequest | null;
  readonly formatting?: MarkdownCommandRequest | null;
  readonly wikiLinks?: readonly WikiLinkCandidate[];
  readonly citations?: readonly CitationCompletionCandidate[];
  readonly onOpenWikiLink?: (path: string) => void;
  readonly onEditWikiLink?: (path: string) => void;
  readonly onOpenCitation?: (id: string) => void;
  readonly onEditCitation?: (id: string) => void;
}

export type MarkdownEditorProps = Omit<CodeEditorProps, "language">;

export function CodeEditor(props: CodeEditorProps): JSX.Element {
  const hostRef = useCodeEditor(props);
  return <div ref={hostRef} className={props.className} />;
}

export function MarkdownEditor(props: MarkdownEditorProps): JSX.Element {
  return <CodeEditor {...props} profile={props.profile ?? "prose"} language="markdown" />;
}
