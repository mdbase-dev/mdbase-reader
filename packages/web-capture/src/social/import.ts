import { dateTime, type PostMedia, type PostPart, type SocialPost } from "@mdbase-reader/core";

import { cslDate, type CitationDraft } from "../csl-values.js";

import { boundedSignal, type SocialFetchOptions } from "./api.js";

import type { CapturedWebDocument, WebCaptureImport } from "../web-capture.js";

export function postCitation(post: SocialPost): CitationDraft {
  return {
    type: "post",
    title: postTitle(post),
    URL: post.url,
    author: [{ literal: post.author.name || post.author.handle }],
    "container-title":
      post.platform === "x" ? "X" : post.platform === "bluesky" ? "Bluesky" : "Mastodon",
    ...(post.published ? { issued: cslDate(post.published) ?? { literal: post.published } } : {}),
  };
}

export function postTitle(post: SocialPost): string {
  return `${post.author.name || post.author.handle}: ${post.text.replace(/\s+/gu, " ").slice(0, 120) || "Post"}`;
}

/** Only the chosen post/thread is archived; never the surrounding feed or account DOM. */
export function postHtml(post: SocialPost): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(postTitle(post))}</title></head><body><main><article class="social-post"><header><h1>${escape(post.author.name || post.author.handle)}</h1><p>@${escape(post.author.handle)} · ${escape(post.platform)}</p></header>${post.parts.map(partHtml).join("")}${post.threadPartial ? "<footer><p>Partial thread: only publicly available or loaded posts were captured.</p></footer>" : ""}</article></main></body></html>`;
}

function partHtml(part: PostPart): string {
  return `<section class="post-part" data-post-id="${escape(part.id)}"><header><p>${escape(part.author.name)} · @${escape(part.author.handle)}</p>${part.published ? `<time datetime="${escape(part.published)}">${escape(part.published)}</time>` : ""}</header><div class="post-text">${part.text
    .split(/\n\n+/u)
    .map((paragraph) => `<p>${escape(paragraph).replaceAll("\n", "<br>")}</p>`)
    .join(
      "",
    )}</div>${part.media.map((media) => `<figure>${media.kind === "image" ? `<img src="${escape(media.url)}" alt="${escape(media.alt)}">` : ""}<figcaption>${escape(mediaCaption(media))}</figcaption></figure>`).join("")}${part.quoted ? `<blockquote class="quoted-post" aria-label="Quoted post">${partHtml(part.quoted)}</blockquote>` : ""}</section>`;
}

function mediaCaption(media: PostMedia): string {
  if (media.alt) {
    return media.alt;
  }
  return media.kind === "image"
    ? "Image"
    : `${media.kind === "audio" ? "Audio" : "Video"} (original URL retained in source metadata)`;
}

export async function socialPostImport(
  post: SocialPost,
  capture: Pick<CapturedWebDocument, "retrievedAt">,
  options: SocialFetchOptions = {},
): Promise<WebCaptureImport> {
  const { prepareHtmlDocument } = await import("@mdbase-reader/renderer-html");
  const archive = postHtml(post);
  const parsed = new DOMParser().parseFromString(archive, "text/html");
  let remaining = 20 * 1024 * 1024;
  for (const [index, image] of [...parsed.querySelectorAll("img")].entries()) {
    try {
      if (index >= 20 || remaining <= 0) {
        throw new Error("Media budget reached");
      }
      const data = await imageData(image.src, Math.min(remaining, 5 * 1024 * 1024), options);
      remaining -= data.size;
      image.src = data.url;
    } catch {
      options.signal?.throwIfAborted();
      const caption = image.parentElement?.querySelector("figcaption");
      if (caption) {
        caption.append(" — image unavailable offline; original URL retained in source metadata.");
      }
      image.remove();
    }
  }
  const stem = `${post.platform}-${
    post.id
      .split("/")
      .at(-1)
      ?.replace(/[^a-zA-Z0-9_-]/gu, "") ?? "post"
  }`;
  return {
    name: `${stem}.readable.html`,
    title: postTitle(post),
    bytes: new TextEncoder().encode(prepareHtmlDocument(parsed.documentElement.outerHTML)),
    archive: { name: `${stem}.archive.html`, bytes: new TextEncoder().encode(archive) },
    capture: {
      submittedUrl: post.url,
      canonicalUrl: post.url,
      retrievedAt: dateTime(capture.retrievedAt),
    },
    metadata: {
      socialPost: post,
      authors: [post.author.name || post.author.handle],
      ...(post.published ? { published: post.published } : {}),
      site: post.platform,
      description: post.text.slice(0, 2_000),
    },
    scholarly: { citation: postCitation(post) },
  };
}

async function imageData(
  url: string,
  maximum: number,
  options: SocialFetchOptions,
): Promise<{ url: string; size: number }> {
  const response = await (options.fetch ?? fetch)(url, {
    credentials: "omit",
    redirect: "error",
    signal: boundedSignal(options.signal, 8_000),
  });
  const type = response.headers.get("content-type")?.split(";")[0];
  if (!response.ok || !type || !/^image\/(png|jpeg|webp|gif|avif)$/u.test(type) || !response.body) {
    throw new Error("Image unavailable");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (let next = await reader.read(); !next.done; next = await reader.read()) {
    size += next.value.length;
    if (size > maximum) {
      await reader.cancel();
      throw new Error("Image too large");
    }
    chunks.push(next.value);
  }
  let binary = "";
  for (const chunk of chunks) {
    for (let offset = 0; offset < chunk.length; offset += 0x8000) {
      binary += String.fromCharCode(...chunk.subarray(offset, offset + 0x8000));
    }
  }
  return { url: `data:${type};base64,${btoa(binary)}`, size };
}

function escape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
