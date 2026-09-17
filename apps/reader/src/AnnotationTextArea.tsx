import { useEffect, useRef, type JSX } from "react";

/** Native editing, selection and IME; no Markdown parser or shared document transactions. */
export function AnnotationTextArea({
  value,
  onChange,
  readOnly = false,
  placeholder,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly readOnly?: boolean;
  readonly placeholder?: string;
}): JSX.Element {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  return (
    <textarea
      ref={ref}
      aria-label="Annotation note"
      className="annotation-textarea"
      rows={7}
      value={value}
      readOnly={readOnly}
      placeholder={placeholder}
      onChange={(event) => onChange(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) {
          event.stopPropagation();
        }
      }}
    />
  );
}
