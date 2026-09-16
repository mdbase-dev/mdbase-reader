import { lazy, Suspense, type JSX } from "react";

import type { EditorLanguage, EditorProfile } from "@mdbase-reader/markdown-editor";

const CodeEditor = lazy(async () => {
  const module = await import("@mdbase-reader/markdown-editor");
  return { default: module.CodeEditor };
});

export function MultilineCodeEditor({
  value,
  ariaLabel,
  language = "markdown",
  profile,
  placeholder,
  className,
  focusOnMount,
  readOnly = false,
  onChange,
  onSave,
}: {
  readonly value: string;
  readonly ariaLabel: string;
  readonly language?: EditorLanguage;
  readonly profile?: EditorProfile;
  readonly placeholder?: string;
  readonly className?: string;
  readonly focusOnMount?: boolean;
  readonly readOnly?: boolean;
  readonly onChange: (value: string) => void;
  readonly onSave?: () => void;
}): JSX.Element {
  return (
    <Suspense fallback={<div className={`${className ?? ""} editor-loading`}>Opening editor…</div>}>
      <CodeEditor
        value={value}
        readOnly={readOnly}
        ariaLabel={ariaLabel}
        language={language}
        profile={profile ?? (language === "json" ? "code" : "compact")}
        onChange={onChange}
        {...(focusOnMount ? { focusOnMount } : {})}
        {...(onSave ? { onSave } : {})}
        {...(placeholder ? { placeholder } : {})}
        {...(className ? { className } : {})}
      />
    </Suspense>
  );
}
