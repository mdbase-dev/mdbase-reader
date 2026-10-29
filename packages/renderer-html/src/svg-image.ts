import purify from "dompurify";

/** Keep embedded images static and self-contained before putting them back in a data URL. */
export function sanitizedSvgImage(value: string): string | null {
  const match = /^data:image\/svg\+xml(?:;charset=utf-8)?(;base64)?,([\s\S]*)$/iu.exec(value);
  if (!match) {
    return null;
  }
  try {
    const payload = decodeURIComponent(match[2] ?? "");
    const source = match[1]
      ? new TextDecoder("utf-8", { fatal: true }).decode(
          Uint8Array.from(atob(payload), (character) => character.charCodeAt(0)),
        )
      : payload;
    const parsed = new DOMParser().parseFromString(source, "image/svg+xml");
    if (
      parsed.doctype ||
      parsed.querySelector("parsererror") ||
      parsed.documentElement.localName !== "svg" ||
      parsed.documentElement.namespaceURI !== "http://www.w3.org/2000/svg"
    ) {
      return null;
    }
    const clean = purify.sanitize(new XMLSerializer().serializeToString(parsed.documentElement), {
      USE_PROFILES: { svg: true, svgFilters: true },
      FORBID_TAGS: ["style", "animate", "animatemotion", "animatetransform", "set", "discard"],
      FORBID_ATTR: ["style", "href", "xlink:href"],
    });
    const sanitized = new DOMParser().parseFromString(clean, "image/svg+xml");
    const svg = sanitized.documentElement;
    if (svg.localName !== "svg" || sanitized.querySelector("parsererror")) {
      return null;
    }
    for (const element of [svg, ...svg.querySelectorAll("*")]) {
      for (const attribute of [...element.attributes]) {
        // Presentation attributes can also load resources; permit only local fragment paints.
        if (
          /\\|url\s*\(/iu.test(attribute.value) &&
          !/^url\(\s*#[\w.-]+\s*\)$/iu.test(attribute.value)
        ) {
          element.removeAttribute(attribute.name);
        }
      }
    }
    return `data:image/svg+xml,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
  } catch {
    return null;
  }
}
