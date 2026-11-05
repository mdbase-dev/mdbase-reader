// Real, compiler-owned English data; tests never mock the translation runtime.
import "@mdbase-reader/i18n";

if (typeof globalThis.Element !== "undefined" && !globalThis.Element.prototype.getAnimations) {
  Object.defineProperty(globalThis.Element.prototype, "getAnimations", {
    configurable: true,
    value: () => [],
  });
}
