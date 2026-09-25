import { useEffect, useLayoutEffect, useRef, type JSX } from "react";

/** Native editing, selection and IME; no Markdown parser or shared document transactions. */
export function AnnotationTextArea({
  value,
  onChange,
  readOnly = false,
  placeholder,
  label = "Comment",
  rows = 7,
  focusOnMount = true,
  autoSize = false,
  className,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly readOnly?: boolean;
  readonly placeholder?: string;
  readonly label?: string;
  readonly rows?: number;
  readonly focusOnMount?: boolean;
  /** Grows with its text instead of scrolling, up to the stylesheet's max height. */
  readonly autoSize?: boolean;
  readonly className?: string;
}): JSX.Element {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (autoSize && element) {
      element.style.height = "auto";
      element.style.height = `${String(element.scrollHeight + element.offsetHeight - element.clientHeight)}px`;
    }
  }, [autoSize, value]);
  useEffect(() => {
    if (focusOnMount) {
      ref.current?.focus({ preventScroll: true });
    }
  }, [focusOnMount]);
  return (
    <textarea
      ref={ref}
      aria-label={label}
      className={className ? `annotation-textarea ${className}` : "annotation-textarea"}
      rows={rows}
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
