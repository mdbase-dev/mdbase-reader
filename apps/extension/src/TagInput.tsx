import { acceptTag, tagSuggestions } from "./tag-suggestions.js";

/** A comma-separated tag field that offers the collection's existing spellings. */
export function TagInput({
  id,
  value,
  known,
  onChange,
  onFocus,
}: {
  readonly id: string;
  readonly value: string;
  readonly known: readonly string[];
  readonly onChange: (value: string) => void;
  readonly onFocus: () => void;
}): React.JSX.Element {
  const suggestions = tagSuggestions(value, known);
  const choose = (tag: string): void => {
    onChange(acceptTag(value, tag));
    document.getElementById(id)?.focus();
  };
  return (
    <div className="tag-input">
      <input
        className="mdbase-field"
        id={id}
        value={value}
        autoComplete="off"
        aria-describedby={suggestions.length ? `${id}-suggestions` : undefined}
        onFocus={onFocus}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          // Tab takes the first suggestion, as in an editor's completion list.
          const first = suggestions[0];
          if (event.key === "Tab" && !event.shiftKey && first) {
            event.preventDefault();
            choose(first);
          }
        }}
      />
      {suggestions.length ? (
        <div className="tag-suggestions" id={`${id}-suggestions`} aria-label="Existing tags">
          {suggestions.map((tag, index) => (
            <button key={tag} type="button" className="tag-chip" onClick={() => choose(tag)}>
              {tag}
              {index === 0 ? <kbd>Tab</kbd> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
