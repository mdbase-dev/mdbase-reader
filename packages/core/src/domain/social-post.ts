export type SocialPlatform = "x" | "bluesky" | "mastodon";

export interface PostMedia {
  readonly url: string;
  readonly alt: string;
  readonly kind: "image" | "video" | "audio";
}

/** Portable post data; HTML is a reading representation, not the source identity. */
export interface PostPart {
  readonly platform: SocialPlatform;
  readonly id: string;
  readonly url: string;
  readonly author: { readonly id: string; readonly handle: string; readonly name: string };
  readonly published?: string;
  readonly text: string;
  readonly media: readonly PostMedia[];
  readonly quoted?: PostPart;
  readonly inReplyTo?: string;
}

export interface SocialPost extends PostPart {
  readonly threadRoot: string;
  readonly parts: readonly PostPart[];
  /** APIs and live pages may omit deleted, private or not-yet-loaded thread parts. */
  readonly threadPartial: boolean;
}

export interface PostPartReference {
  readonly id: string;
  readonly url: string;
  readonly quoted?: { readonly id: string; readonly url: string };
}

/** What a source's frontmatter keeps: identity and thread shape. Text and media live in the body. */
export interface SocialPostReference {
  readonly platform: SocialPlatform;
  readonly id: string;
  readonly url: string;
  readonly author: PostPart["author"];
  readonly published?: string;
  readonly threadRoot: string;
  readonly threadPartial: boolean;
  readonly parts: readonly PostPartReference[];
}
