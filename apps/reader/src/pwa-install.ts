import { i18n } from "@lingui/core";
import { t } from "@lingui/core/macro";
// Installation is offered only after Reader has been used, never during first sign-in.
interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const COOLDOWN = 30 * 24 * 60 * 60 * 1000;
const DELAY = 30_000;
const STORAGE_KEY = "mdbase:pwa-install-dismissed";
const USED_KEY = "mdbase:reader-used";
const USED_EVENT = "mdbase:reader-document-opened";

/** Opening a document is useful engagement; signing in alone is not. */
export function markPwaInstallEligible(): void {
  try {
    localStorage.setItem(USED_KEY, "1");
  } catch {
    /* The current tab can still offer installation without persistent storage. */
  }
  window.dispatchEvent(new Event(USED_EVENT));
}

/** A delay starts only after useful engagement, including a previous used visit. */
function waitForReaderUse(ready: () => void): () => void {
  let timer: number | null = null;
  const used = (): void => {
    timer ??= window.setTimeout(ready, DELAY);
  };
  window.addEventListener(USED_EVENT, used);
  try {
    if (localStorage.getItem(USED_KEY) === "1") {
      used();
    }
  } catch {
    /* Wait for this tab to open a document. */
  }
  return () => {
    if (timer !== null) {
      window.clearTimeout(timer);
    }
    window.removeEventListener(USED_EVENT, used);
  };
}

function recentlyDismissed(): boolean {
  try {
    const timestamp = Number(localStorage.getItem(STORAGE_KEY));
    return timestamp > 0 && Date.now() - timestamp < COOLDOWN;
  } catch {
    return false;
  }
}

/** Installation is optional; no service worker or private-data cache is introduced. */
export function setupPwaInstall(appName: string): () => void {
  const standalone = matchMedia("(display-mode: standalone)");
  const iosStandalone = (): boolean =>
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  const isInstalled = (): boolean => standalone.matches || iosStandalone();
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);
  const safari =
    navigator.userAgent.includes("Safari") && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(navigator.userAgent);
  let dismissed = recentlyDismissed();
  let pending: InstallEvent | null = null;
  let ready = false;
  let banner: HTMLElement | null = null;
  let disposed = false;

  const remove = (): void => {
    banner?.remove();
    banner = null;
  };
  const dismiss = (): void => {
    dismissed = true;
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch {
      /* Best effort. */
    }
    remove();
  };
  const show = (): void => {
    if (
      disposed ||
      !ready ||
      dismissed ||
      isInstalled() ||
      banner ||
      (!pending && !(ios && safari))
    ) {
      return;
    }
    banner = document.createElement("section");
    banner.className = "pwa-install";
    banner.setAttribute("aria-label", t`Install ${appName}`);
    const message = document.createElement("p");
    message.textContent = pending
      ? t`Install ${appName} for quick access in its own window.`
      : t`Add ${appName} to your Home Screen: tap Share, then Add to Home Screen.`;
    banner.append(message);
    if (pending) {
      const install = document.createElement("button");
      install.type = "button";
      install.textContent = t({ message: "Install", context: "pwa install" });
      const installApp = async (): Promise<void> => {
        const event = pending;
        if (!event) {
          return;
        }
        pending = null; // A native prompt event can only be used once.
        install.disabled = true;
        try {
          await event.prompt();
          const choice = await event.userChoice;
          if (choice.outcome === "dismissed") {
            dismiss();
          } else {
            remove();
          }
        } catch {
          remove(); // Do not leave a broken install button on screen.
        }
      };
      install.addEventListener("click", () => {
        void installApp();
      });
      banner.append(install);
    }
    const later = document.createElement("button");
    later.type = "button";
    later.textContent = t({ message: "Not now", context: "pwa install" });
    later.addEventListener("click", dismiss);
    banner.append(later);
    document.body.append(banner);
  };
  const beforeInstall = (event: Event): void => {
    // Leave browser-provided installation alone when our invitation is suppressed.
    if (dismissed || isInstalled()) {
      return;
    }
    event.preventDefault();
    pending = event as InstallEvent;
    show();
  };
  const installed = (): void => {
    pending = null;
    dismissed = true;
    remove();
  };
  const modeChanged = (): void => {
    if (isInstalled()) {
      installed();
    }
  };
  const stopLanguage = i18n.on("change", () => {
    remove();
    show();
  });
  window.addEventListener("beforeinstallprompt", beforeInstall);
  window.addEventListener("appinstalled", installed);
  standalone.addEventListener("change", modeChanged);
  const stopWaiting = waitForReaderUse(() => {
    ready = true;
    show();
  });
  return () => {
    disposed = true;
    stopWaiting();
    stopLanguage();
    window.removeEventListener("beforeinstallprompt", beforeInstall);
    window.removeEventListener("appinstalled", installed);
    standalone.removeEventListener("change", modeChanged);
    remove();
  };
}
