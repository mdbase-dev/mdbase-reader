// @vitest-environment happy-dom
import { createI18nRuntime } from "@mdbase-dev/i18n";
import english from "@mdbase-reader/i18n/english";
import french from "@mdbase-reader/i18n/locales/fr";
import { ReaderI18nProvider, ReaderLanguageSetting } from "@mdbase-reader/i18n/react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.lang = "en";
});

it("retains the active locale on load failure and clears the notice after recovery", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const saved: string[] = [];
  const runtime = createI18nRuntime({
    english,
    preferences: [],
    loadLocale: (locale) =>
      locale === "de"
        ? Promise.reject(new Error("missing deployment chunk"))
        : Promise.resolve(french),
    storage: {
      getLocale: () => null,
      setLocale: (locale) => {
        saved.push(locale);
      },
    },
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const choose = async (locale: string): Promise<void> => {
    await act(async () => {
      const select = host.querySelector("select");
      if (!select) {
        throw new Error("Language picker missing");
      }
      select.value = locale;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });
  };
  try {
    await act(async () => {
      root.render(
        <ReaderI18nProvider runtime={runtime}>
          <ReaderLanguageSetting />
        </ReaderI18nProvider>,
      );
      await runtime.initialize();
    });
    expect(host.querySelectorAll("option")).toHaveLength(9);
    await choose("de");
    expect(runtime.i18n.locale).toBe("en");
    expect(saved).toEqual([]);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "language could not be loaded",
    );
    await choose("fr");
    expect(runtime.i18n.locale).toBe("fr");
    expect(document.documentElement.lang).toBe("fr");
    expect(saved).toEqual(["fr"]);
    expect(host.querySelector('[role="alert"]')).toBeNull();
    await choose("en");
    expect(host.querySelector('[role="alert"]')).toBeNull();
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});
