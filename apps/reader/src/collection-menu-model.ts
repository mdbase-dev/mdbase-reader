export interface CollectionChoice {
  readonly collectionId: string;
  readonly displayName: string;
  /** Where the collection lives, when Connect says: hosted by mdbase or on a computer. */
  readonly authority?: { readonly kind: "hosted" | "connector" };
}

/** The current collection first (under its freshest name), then the rest alphabetically. */
export function orderedChoices(
  choices: readonly CollectionChoice[],
  currentId: string,
  currentName: string,
): readonly CollectionChoice[] {
  const current = choices.find(({ collectionId }) => collectionId === currentId);
  const others = choices
    .filter(({ collectionId }) => collectionId !== currentId)
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
  return current ? [{ ...current, displayName: currentName }, ...others] : others;
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/u).filter(Boolean);
  const letters = words.slice(0, 2).map((word) => String.fromCodePoint(word.codePointAt(0) ?? 63));
  return (letters.join("") || "?").toLocaleUpperCase();
}

/** A stable hue per collection, so each keeps its colour across sessions. */
export function hueOf(collectionId: string): number {
  let hash = 0;
  for (const code of collectionId) {
    hash = (hash * 31 + (code.codePointAt(0) ?? 0)) % 360;
  }
  return hash;
}

export function locationLabel(choice: CollectionChoice): string | null {
  switch (choice.authority?.kind) {
    case "hosted":
      return "Hosted by mdbase";
    case "connector":
      return "On your computer";
    default:
      return null;
  }
}
