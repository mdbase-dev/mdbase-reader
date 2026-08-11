import { lazy, Suspense, type JSX } from "react";

import type { EditorLanguage } from "@mdbase-reader/markdown-editor";

const CodeEditor = lazy(async () => {
  const module = await import("@mdbase-reader/markdown-editor");
  return { default: module.CodeEditor };
});

export function MultilineCodeEditor({
  value,
  ariaLabel,
  language = "markdown",
  placeholder,
  className,
  onChange,
}: {
  readonly value: string;
  readonly ariaLabel: string;
  readonly language?: EditorLanguage;
  readonly placeholder?: string;
  readonly className?: string;
  readonly onChange: (value: string) => void;
}): JSX.Element {
  return (
    <Suspense fallback={<div className={`${className ?? ""} editor-loading`}>Opening editor…</div>}>
      <CodeEditor
        value={value}
        ariaLabel={ariaLabel}
        language={language}
        onChange={onChange}
        {...(placeholder ? { placeholder } : {})}
        {...(className ? { className } : {})}
      />
    </Suspense>
  );
}
