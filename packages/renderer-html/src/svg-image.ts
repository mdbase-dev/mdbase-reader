import purify from "dompurify";

/** Keep embedded images static and self-contained before putting them back in a data URL. */
export function sanitizedSvgImage(value: string): string | null {
  const match = /^data:image\/svg\+xml(?:;charset=utf-8|;utf8)?(;base64)?,([\s\S]*)$/iu.exec(value);
  if (!match || !purify.isSupported) {
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
      parsed.querySelector("parsererror") ||
      parsed.documentElement.localName !== "svg" ||
      parsed.documentElement.namespaceURI !== "http://www.w3.org/2000/svg"
    ) {
      return null;
    }
    // Only the root is kept; source doctypes and processing instructions never reach the image.
    const clean = purify.sanitize(new XMLSerializer().serializeToString(parsed.documentElement), {
      USE_PROFILES: { svg: true, svgFilters: true },
      ADD_TAGS: ["use"],
      FORBID_TAGS: ["style", "animate", "animatemotion", "animatetransform", "set", "discard"],
      FORBID_ATTR: ["style"],
      RETURN_DOM_FRAGMENT: true,
    });
    const svg = clean.firstElementChild;
    if (svg?.localName !== "svg") {
      return null;
    }
    sanitizeSvgReferences(svg);
    return `data:image/svg+xml,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
  } catch {
    return null;
  }
}

function sanitizeSvgReferences(svg: Element): void {
  for (const element of [svg, ...svg.querySelectorAll("*")]) {
    for (const attribute of [...element.attributes]) {
      // Presentation attributes can also load resources; permit only local fragment paints.
      if (
        (attribute.localName === "href" && !attribute.value.trim().startsWith("#")) ||
        (/\\|url\s*\(/iu.test(attribute.value) &&
          !/^url\(\s*(['"]?)#[\w.-]+\1\s*\)$/iu.test(attribute.value))
      ) {
        element.removeAttribute(attribute.name);
      }
    }
  }
}
