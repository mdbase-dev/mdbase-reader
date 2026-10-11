import type { PostPart, SocialPost } from "@mdbase-reader/core";

/** Follow only explicit reply edges by the same author; chronology alone is not a thread. */
export function unrollThread(
  selected: PostPart,
  available: readonly PostPart[],
  partial: boolean,
): SocialPost {
  const byId = new Map(available.map((part) => [part.id, part]));
  byId.set(selected.id, selected);
  let root = selected;
  const seen = new Set([root.id]);
  while (root.inReplyTo) {
    const parent = byId.get(root.inReplyTo);
    if (parent?.author.id !== selected.author.id || seen.has(parent.id)) {
      break;
    }
    root = parent;
    seen.add(root.id);
  }
  const parts: PostPart[] = [];
  const visit = (part: PostPart): void => {
    if (parts.some((item) => item.id === part.id)) {
      return;
    }
    parts.push(part);
    const children = [...byId.values()]
      .filter((item) => item.inReplyTo === part.id && item.author.id === selected.author.id)
      .sort(
        (a, b) => (a.published ?? "").localeCompare(b.published ?? "") || a.id.localeCompare(b.id),
      );
    children.forEach(visit);
  };
  visit(root);
  return { ...root, threadRoot: root.id, parts, threadPartial: partial };
}
