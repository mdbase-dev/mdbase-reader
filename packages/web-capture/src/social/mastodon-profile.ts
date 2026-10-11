import { array, publicJson, record, text } from "./api.js";

import type { SocialFetchOptions } from "./api.js";

const pending = new WeakMap<Document, Promise<void>>();

/** Current Mastodon anonymous profiles render text-only placeholders with no permalink.
 * Match those loaded placeholders to the official account API, never to unseen API items. */
export function prepareMastodonProfile(
  document: Document,
  options: SocialFetchOptions = {},
): Promise<void> {
  const wrappers = [
    ...document.querySelectorAll(".status__wrapper:not([data-reader-post-url])"),
  ].filter(
    (element) =>
      element.children.length === 2 &&
      [...element.children].every((child) => child.tagName === "SPAN"),
  );
  const account = /^\/@([^/]+)\/?$/u.exec(document.location.pathname)?.[1];
  if (!wrappers.length || !account) {
    return Promise.resolve();
  }
  const existing = pending.get(document);
  if (existing) {
    return existing;
  }
  const work = hydrate(
    document.location.origin,
    decodeURIComponent(account),
    wrappers,
    options,
  ).finally(() => pending.delete(document));
  pending.set(document, work);
  return work;
}

async function hydrate(
  origin: string,
  account: string,
  wrappers: readonly Element[],
  options: SocialFetchOptions,
): Promise<void> {
  const result = record(
    await publicJson(
      `${origin}/api/v1/accounts/lookup?acct=${encodeURIComponent(account)}`,
      options,
    ),
  );
  const id = text(result["id"]);
  if (!/^\d+$/u.test(id)) {
    throw new Error("Mastodon could not resolve this profile.");
  }
  const statuses: Record<string, unknown>[] = [];
  let maximum = "";
  for (let page = 0; page < 3; page++) {
    const batch = array(
      await publicJson(
        `${origin}/api/v1/accounts/${id}/statuses?limit=40${maximum ? `&max_id=${maximum}` : ""}`,
        options,
      ),
    ).map(record);
    statuses.push(...batch);
    if (batch.length < 40 || statuses.length >= wrappers.length + 40) {
      break;
    }
    maximum = text(batch.at(-1)?.["id"]);
    if (!/^\d+$/u.test(maximum)) {
      break;
    }
  }
  for (const wrapper of wrappers) {
    const author = wrapper.children[0]?.textContent.trim();
    const content = wrapper.children[1]?.textContent.trim();
    const matches = statuses.filter(
      (status) =>
        text(status["content"]).trim() === content &&
        text(record(status["account"])["display_name"]).trim() === author,
    );
    if (matches.length !== 1) {
      continue;
    }
    const status = matches[0];
    if (!status) {
      continue;
    }
    const statusId = text(status["id"]);
    const acct = text(record(status["account"])["acct"]);
    if (!/^\d+$/u.test(statusId) || !acct) {
      continue;
    }
    wrapper.setAttribute(
      "data-reader-post-url",
      `${origin}/@${encodeURIComponent(acct)}/${statusId}`,
    );
    wrapper.setAttribute("data-uri", text(status["uri"]));
    const parsed = wrapper.ownerDocument.implementation.createHTMLDocument("");
    parsed.body.innerHTML = text(status["content"]);
    parsed.querySelectorAll("script,style").forEach((element) => element.remove());
    wrapper.setAttribute("data-reader-post-text", parsed.body.textContent);
    wrapper.setAttribute("data-reader-post-author", acct);
    wrapper.setAttribute("data-reader-post-published", text(status["created_at"]));
  }
}
