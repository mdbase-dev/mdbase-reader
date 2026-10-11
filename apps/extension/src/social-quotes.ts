import { matchTextQuote, type SocialPost } from "@mdbase-reader/core";

import type { PageQuote } from "./page-annotations.js";

/** A quote is searched only inside a matching post, never inside its neighbour's text. */
export function scopePostQuotes(
  quotes: readonly PageQuote[],
  post?: SocialPost,
): readonly PageQuote[] {
  if (!post) {
    return quotes;
  }
  return quotes.flatMap((quote) => {
    if (quote.postId) {
      const explicit = post.parts.find(
        (part) => part.id === quote.postId || part.quoted?.id === quote.postId,
      );
      if (explicit) {
        return [{ ...quote, postUrl: explicit.url }];
      }
    }
    const parts = post.parts.filter((part) => {
      const match = matchTextQuote(part.text, quote);
      return match && !match.ambiguous;
    });
    // Uncertain matches are not silently projected onto another post.
    const [matched] = parts;
    return [
      {
        ...quote,
        postUrl:
          parts.length === 1 && matched ? matched.url : "https://reader.invalid/unresolved-post",
      },
    ];
  });
}

export function storedSocialPost(
  properties?: Readonly<Record<string, unknown>>,
): SocialPost | undefined {
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
  return value as SocialPost;
}
