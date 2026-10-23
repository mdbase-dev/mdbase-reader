// @vitest-environment happy-dom
import { expect, it } from "vitest";

import { pageClaims } from "./page-claims.js";
import { resolveCitation } from "./resolver.js";

const observedAt = "2026-10-23T12:00:00Z";
function claims(title: string, body = ""): ReturnType<typeof pageClaims>["claims"] {
  const document = new DOMParser().parseFromString(
    `<html><head><title>${title}</title></head><body>${body}</body></html>`,
    "text/html",
  );
  return pageClaims(document, "https://www.example.org/work", observedAt).claims;
}

it.each([
  "Just a moment...",
  "Just a moment…",
  "Attention Required! | Cloudflare",
  "Access denied",
  "Are you a robot?",
  "Human Verification | A library",
  "403 Forbidden",
  "Error 403 - Forbidden",
  "Verify you are human",
  "example.org",
])("does not cite the interstitial %s as the work", (title) => {
  const page = claims(title);
  expect(page.filter((claim) => claim.field === "title")).toEqual([]);
  expect(resolveCitation({ claims: page }).citation).toBeNull();
});

it("does not turn a challenge h1 into a title", () => {
  expect(claims("Human Verification | A library", "<h1>Human Verification</h1>")).toEqual([]);
});

it.each([
  "Checking your browser before accessing example.org",
  "Checking if the site connection is secure",
  "Verifying you are human...",
  "Performing security verification",
  "Please wait while we verify your request",
  "Please verify you are a human",
  "Verify you are not a robot",
  "Press & Hold to confirm you are a human (and not a bot)",
  "We have detected unusual activity from your computer network",
  "Pardon our interruption",
  "Before we continue...",
  "You don't have permission to access https://example.org on this server.",
  "Please enable JS and disable any ad blocker",
  "Enable JavaScript and cookies to continue",
  "Please complete the security check to access example.org",
  "Please solve this hCaptcha to continue",
  "Please complete the reCAPTCHA to continue",
])("does not treat the challenge instruction %s as a real work heading", (heading) => {
  expect(
    claims(
      "Just a moment...",
      `<h1>${heading}</h1><p>Enable JavaScript and cookies to continue</p>`,
    ),
  ).toEqual([]);
  expect(claims(heading)).toEqual([]);
});

it.each([
  "Cloudflare changes its policies",
  "Access denied: a history of censorship",
  "A human verification study",
])("retains a real article discussing challenges: %s", (title) => {
  expect(resolveCitation({ claims: claims(title, `<h1>${title}</h1>`) }).citation?.["title"]).toBe(
    title,
  );
});

it.each([
  "Checking your browser: a guide to privacy settings",
  "Why websites ask you to enable JavaScript and cookies",
  "Cloudflare, Akamai, PerimeterX and DataDome compared",
  "A history of hCaptcha and reCAPTCHA",
])("keeps a real work heading behind a challenge-like title: %s", (heading) => {
  expect(
    resolveCitation({ claims: claims("Access denied", `<h1>${heading}</h1>`) }).citation,
  ).not.toBeNull();
});

it("keeps a genuine host-named work with a heading", () => {
  expect(
    resolveCitation({ claims: claims("example.org", "<h1>example.org</h1>") }).citation?.["title"],
  ).toBe("example.org");
});

it.each([
  [
    "Access Denied | The MIT Press",
    '<meta name="citation_title" content="Access Denied"><meta name="citation_doi" content="10.7551/mitpress/8551.001.0001">',
  ],
  [
    "Just a moment - The New Yorker",
    '<meta property="og:title" content="Just a moment: the pause before a decision">',
  ],
])("reads a real work whose title looks like a challenge: %s", (title, head) => {
  const document = new DOMParser().parseFromString(
    `<html><head><title>${title}</title>${head}</head><body><h1>A work</h1></body></html>`,
    "text/html",
  );
  const page = pageClaims(document, "https://www.example.org/work", observedAt);
  expect(page.claims.some((claim) => claim.field === "title")).toBe(true);
});

it("reads a JSON-LD work behind a challenge-like title", () => {
  const document = new DOMParser().parseFromString(
    `<html><head><title>Access denied</title><script type="application/ld+json">${JSON.stringify({
      "@type": "Book",
      name: "Access Denied: The Practice and Policy of Global Internet Filtering",
    })}</script></head><body></body></html>`,
    "text/html",
  );
  expect(
    resolveCitation({
      claims: pageClaims(document, "https://www.example.org/work", observedAt).claims,
    }).citation?.["title"],
  ).toBe("Access Denied: The Practice and Policy of Global Internet Filtering");
});
