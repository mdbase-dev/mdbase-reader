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
    )}</div>${part.media.map(mediaHtml).join("")}${part.quoted ? `<blockquote class="quoted-post" aria-label="Quoted post">${partHtml(part.quoted)}</blockquote>` : ""}</section>`;
}

/** The archive keeps every original media URL; the readable copy drops external links. */
function mediaHtml(media: PostMedia): string {
  const caption = escape(mediaCaption(media));
  return media.kind === "image"
    ? `<figure><img src="${escape(media.url)}" alt="${escape(media.alt)}"><figcaption>${caption}</figcaption></figure>`
    : `<figure><figcaption><a href="${escape(media.url)}">${caption}</a></figcaption></figure>`;
}

function mediaCaption(media: PostMedia): string {
  if (media.alt) {
    return media.alt;
  }
  return media.kind === "image"
    ? "Image"
    : `${media.kind === "audio" ? "Audio" : "Video"} (original URL kept in the archived copy)`;
}

export async function socialPostImport(
  post: SocialPost,
  capture: Pick<CapturedWebDocument, "retrievedAt">,
  options: SocialFetchOptions = {},
): Promise<WebCaptureImport> {
  const { prepareHtmlDocument } = await import("@mdbase-reader/renderer-html");
  const archive = postHtml(post);
  const parsed = new DOMParser().parseFromString(archive, "text/html");
  // Reading copies are self-contained (the renderer allows only data: images), so images
  // are embedded, but scaled and re-encoded first to keep the copy light to sync and render.
  let remaining = mediaBudget.total;
  for (const [index, image] of [...parsed.querySelectorAll("img")].entries()) {
    try {
      if (index >= mediaBudget.images || remaining <= 0) {
        throw new Error("Media budget reached");
      }
      const data = await embeddedImage(image.src, Math.min(remaining, mediaBudget.image), options);
      remaining -= data.size;
      image.src = data.url;
    } catch {
      options.signal?.throwIfAborted();
      const caption = image.parentElement?.querySelector("figcaption");
      if (caption) {
        caption.append(" — image unavailable offline; the archived copy keeps its original URL.");
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
    claims: { claims: [] },
  };
}

const mediaBudget = {
  images: 20,
  /** Largest original accepted for scaling. */
  download: 10 * 1024 * 1024,
  /** Largest embedded image, after scaling. */
  image: 1536 * 1024,
  total: 6 * 1024 * 1024,
};
const maximumDimension = 1600;

async function embeddedImage(
  url: string,
  maximum: number,
  options: SocialFetchOptions,
): Promise<{ url: string; size: number }> {
  const original = await downloadImage(url, options);
  const image = await scaledImage(original).catch(() => original);
  if (image.size > maximum) {
    throw new Error("Image too large");
  }
  const bytes = new Uint8Array(await image.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return { url: `data:${image.type};base64,${btoa(binary)}`, size: bytes.length };
}

async function downloadImage(url: string, options: SocialFetchOptions): Promise<Blob> {
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
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  for (let next = await reader.read(); !next.done; next = await reader.read()) {
    size += next.value.length;
    if (size > mediaBudget.download) {
      await reader.cancel();
      throw new Error("Image too large");
    }
    chunks.push(next.value);
  }
  return new Blob(chunks, { type });
}

/** Large images are scaled down and re-encoded; animated GIFs are kept so they still play. */
async function scaledImage(image: Blob): Promise<Blob> {
  if (
    image.type === "image/gif" ||
    typeof createImageBitmap !== "function" ||
    typeof OffscreenCanvas !== "function"
  ) {
    return image;
  }
  const bitmap = await createImageBitmap(image);
  try {
    const scale = Math.min(1, maximumDimension / Math.max(bitmap.width, bitmap.height));
    const canvas = new OffscreenCanvas(
      Math.max(1, Math.round(bitmap.width * scale)),
      Math.max(1, Math.round(bitmap.height * scale)),
    );
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const encoded = await canvas.convertToBlob({ type: "image/webp", quality: 0.82 });
    // Browsers without WebP encoding return PNG, which is rarely smaller than the original.
    return encoded.type === "image/webp" && encoded.size < image.size ? encoded : image;
  } finally {
    bitmap.close();
  }
}

function escape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
