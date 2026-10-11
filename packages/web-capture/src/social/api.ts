import { postAddress, type PostAddress } from "./identity.js";

import type { PostMedia, PostPart } from "@mdbase-reader/core";

export interface SocialFetchOptions {
  readonly fetch?: typeof fetch;
  readonly signal?: AbortSignal;
}

/** Public, credential-free, bounded requests only. No session or undocumented endpoints. */
export async function publicJson(url: string, options: SocialFetchOptions): Promise<unknown> {
  const response = await (options.fetch ?? fetch)(url, {
    credentials: "omit",
    redirect: "error",
    headers: { accept: "application/json" },
    signal: boundedSignal(options.signal, 12_000),
  });
  if (!response.ok) {
    throw new Error(`Post API returned HTTP ${String(response.status)}.`);
  }
  if (!response.body) {
    throw new Error("Post API returned no content.");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (let next = await reader.read(); !next.done; next = await reader.read()) {
    length += next.value.length;
    if (length > 2 * 1024 * 1024) {
      await reader.cancel();
      throw new Error("Post API response is too large.");
    }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

export function boundedSignal(signal: AbortSignal | undefined, milliseconds: number): AbortSignal {
  const deadline = AbortSignal.timeout(milliseconds);
  return signal ? AbortSignal.any([signal, deadline]) : deadline;
}

export async function blueskyIdentity(
  address: PostAddress,
  options: SocialFetchOptions,
): Promise<PostAddress> {
  const actor = address.id.split("/")[2] ?? "";
  if (actor.startsWith("did:")) {
    return address;
  }
  const result = record(
    await publicJson(
      `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(actor)}`,
      options,
    ),
  );
  const did = text(result["did"]);
  const key = address.id.split("/").at(-1);
  const resolved =
    did.startsWith("did:") && key ? postAddress(`at://${did}/app.bsky.feed.post/${key}`) : null;
  if (!resolved) {
    throw new Error("Bluesky could not resolve the author's identity.");
  }
  return resolved;
}

export function blueskyPart(value: unknown, depth = 0): PostPart {
  const post = record(value);
  const address = postAddress(text(post["uri"]));
  if (!address?.id.startsWith("at://did:")) {
    throw new Error("Bluesky returned an invalid post identity.");
  }
  const author = record(post["author"]);
  const content = record(post["record"]);
  const embed = record(post["embed"]);
  const images = array(embed["images"] ?? record(embed["media"])["images"]);
  const video = text(embed["playlist"] ?? record(embed["media"])["playlist"]);
  const media: PostMedia[] = images.flatMap((value) => {
    const image = record(value);
    const url = https(text(image["fullsize"]));
    return url ? [{ kind: "image", url, alt: text(image["alt"]) }] : [];
  });
  if (https(video)) {
    media.push({ kind: "video", url: video, alt: text(embed["alt"]) });
  }
  const quote = record(embed["record"]);
  const quoted = quote["uri"] ? quote : record(quote["record"]);
  const parent = text(record(record(content["reply"])["parent"])["uri"]);
  return {
    platform: "bluesky",
    id: address.id,
    url: address.url,
    author: {
      id: text(author["did"]),
      handle: text(author["handle"]),
      name: text(author["displayName"]) || text(author["handle"]),
    },
    published: text(content["createdAt"]),
    text: text(content["text"]),
    media,
    ...(depth === 0 && quoted["uri"]
      ? { quoted: blueskyPart({ ...quoted, record: quoted["value"] ?? quoted["record"] }, 1) }
      : {}),
    ...(parent ? { inReplyTo: parent } : {}),
  };
}

export function mastodonPart(value: unknown, document: Document, depth = 0): PostPart {
  const post = record(value);
  const uri = https(text(post["uri"]));
  if (!uri) {
    throw new Error("Mastodon returned an invalid status URI.");
  }
  const account = record(post["account"]);
  const parsed = document.implementation.createHTMLDocument("");
  parsed.body.innerHTML = text(post["content"]);
  parsed.querySelectorAll("script,style").forEach((element) => element.remove());
  parsed.querySelectorAll("br").forEach((element) => element.replaceWith("\n"));
  parsed.querySelectorAll("p").forEach((element) => element.append("\n"));
  const authorUrl = https(text(account["url"]));
  const handle = text(account["acct"]);
  const parent = text(post["in_reply_to_id"]);
  const quote = record(post["quote"])["quoted_status"];
  return {
    platform: "mastodon",
    id: uri,
    url: uri,
    author: {
      id: authorUrl || text(account["id"]),
      handle: handle.includes("@") ? handle : `${handle}@${new URL(uri).hostname}`,
      name: text(account["display_name"]) || handle,
    },
    published: text(post["created_at"]),
    text: [text(post["spoiler_text"]), parsed.body.textContent.trim()].filter(Boolean).join("\n\n"),
    media: array(post["media_attachments"]).flatMap((value) => {
      const media = record(value);
      const url = https(text(media["url"]));
      return url
        ? [
            {
              url,
              alt: text(media["description"]),
              kind: attachmentKind(text(media["type"])),
            },
          ]
        : [];
    }),
    ...(parent ? { inReplyTo: parent } : {}),
    ...(quote && depth === 0 ? { quoted: mastodonPart(quote, document, 1) } : {}),
  };
}

function attachmentKind(type: string): PostMedia["kind"] {
  return type === "image" || type === "audio" ? type : "video";
}

export function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
export function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
export function https(value: string): string {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : "";
  } catch {
    return "";
  }
}
