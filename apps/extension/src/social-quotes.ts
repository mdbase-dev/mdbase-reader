import type { PageQuote } from "./page-annotations.js";
import type { SocialPostReference } from "@mdbase-reader/core";

const unresolvedPost = "https://reader.invalid/unresolved-post";

/** A quote is drawn only inside the post it was made in, never inside its neighbour's text. */
export function scopePostQuotes(
  quotes: readonly PageQuote[],
  post?: SocialPostReference,
): readonly PageQuote[] {
  if (!post) {
    return quotes;
  }
  const [only] = post.parts;
  return quotes.map((quote) => {
    // A quoted post is drawn inside the post quoting it, so it resolves to that part.
    const part = quote.postId
      ? post.parts.find((item) => item.id === quote.postId || item.quoted?.id === quote.postId)
      : undefined;
    // Without a recorded post, only a single-post source is certain; a thread is not guessed.
    const url = part?.url ?? (!quote.postId && post.parts.length === 1 ? only?.url : undefined);
    return { ...quote, postUrl: url ?? unresolvedPost };
  });
}

export function storedSocialPost(
  properties?: Readonly<Record<string, unknown>>,
): SocialPostReference | undefined {
  const value = properties?.["social_post"];
  if (
    !value ||
    typeof value !== "object" ||
    !("parts" in value) ||
    !Array.isArray(value.parts) ||
    !("url" in value) ||
    typeof value.url !== "string"
  ) {
    return undefined;
  }
  return value as SocialPostReference;
}
