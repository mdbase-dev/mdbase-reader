// @vitest-environment happy-dom
import { msg } from "@lingui/core/macro";
import { createI18nRuntime } from "@mdbase-dev/i18n";
import { CommandPalette } from "@mdbase-dev/ui/command-palette";
import { readerI18n } from "@mdbase-reader/i18n";
import english from "@mdbase-reader/i18n/english";
import french from "@mdbase-reader/i18n/locales/fr";
import { ReaderI18nProvider, ReaderLanguageSetting } from "@mdbase-reader/i18n/react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

import { readerCommandGroupLabel, type ReaderCommand } from "./reader-command-list.js";

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.lang = "en";
});

it("composes real shared UI translations on the same Lingui singleton", async () => {
  const cancel = msg`Cancel`;
  try {
    await readerI18n.selectLocale("ja");
    expect(readerI18n.i18n._(cancel)).toBe("キャンセル");
  } finally {
    await readerI18n.selectLocale("en");
  }
});

it("localizes public palette headings live without changing group, showAll or command identities", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const run = vi.fn();
  const close = vi.fn();
  const groups = [
    "Open tabs",
    "Current source",
    "Sources",
    "Library",
    "Workspace",
    "Display",
  ] as const;
  const commands: readonly ReaderCommand[] = groups.flatMap((group) =>
    Array.from({ length: 8 }, (_, index) => ({
      id: `${group}:${String(index)}`,
      label: `User title ${String(index)}`,
      group,
      run: () => {
        run(`${group}:${String(index)}`);
      },
    })),
  );
  const identities = commands.map(({ id, group }) => ({ id, group }));
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => {
      await readerI18n.selectLocale("ja");
      root.render(
        <ReaderI18nProvider>
          <CommandPalette
            open
            commands={commands}
            showAll={["Open tabs"]}
            groupLabel={readerCommandGroupLabel}
            onClose={close}
          />
        </ReaderI18nProvider>,
      );
    });
    const headings = (): readonly (string | null)[] =>
      [...host.querySelectorAll(".mdbase-command-group")].map((node) => node.textContent);
    expect(headings()).toEqual([
      "開いているタブ",
      "現在の資料",
      "資料",
      "ライブラリ",
      "ワークスペース",
      "表示",
    ]);
    // Open tabs bypasses the six-command browse limit using its original English ID.
    expect(host.querySelectorAll('[role="option"]')).toHaveLength(8 + 5 * 6);
    await act(async () => {
      await readerI18n.selectLocale("de");
    });
    expect(headings()).toEqual([
      "Offene Tabs",
      "Aktuelle Quelle",
      "Quellen",
      "Bibliothek",
      "Arbeitsfläche",
      "Anzeige",
    ]);
    expect(host.querySelectorAll('[role="option"]')).toHaveLength(8 + 5 * 6);
    expect(commands.map(({ id, group }) => ({ id, group }))).toEqual(identities);
    expect(readerCommandGroupLabel("Unknown group")).toBe("Unknown group");
    const input = host.querySelector("input");
    if (!input) {
      throw new Error("Palette input missing");
    }
    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(run).toHaveBeenCalledWith("Open tabs:0");
    expect(close).toHaveBeenCalledOnce();
  } finally {
    act(() => root.unmount());
    host.remove();
    await readerI18n.selectLocale("en");
  }
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
