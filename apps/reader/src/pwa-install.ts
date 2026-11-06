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
const USED_EVENT = "mdbase:reader-document-opened";

/** Finishing a read or adding a source is engagement in the current session. */
export function markPwaInstallEligible(): void {
  window.dispatchEvent(new Event(USED_EVENT));
}

/** A delay starts only after useful engagement in this session. */
function waitForReaderUse(ready: () => void): () => void {
  let timer: number | null = null;
  const used = (): void => {
    timer ??= window.setTimeout(ready, DELAY);
  };
  window.addEventListener(USED_EVENT, used);
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

function isIosSafari(): boolean {
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);
  return (
    ios &&
    navigator.userAgent.includes("Safari") &&
    !/CriOS|FxiOS|EdgiOS|OPiOS/.test(navigator.userAgent)
  );
}

/** Installation is optional; no service worker or private-data cache is introduced. */
export function setupPwaInstall(appName: string): () => void {
  const standalone = matchMedia("(display-mode: standalone)");
  const isInstalled = (): boolean =>
    standalone.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
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
    if (installOverlayOpen()) {
      remove();
      return;
    }
    if (
      disposed ||
      !ready ||
      dismissed ||
      isInstalled() ||
      banner ||
      (!pending && !isIosSafari())
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
  const stopOverlays = observeInstallOverlays(show);
  window.addEventListener("beforeinstallprompt", beforeInstall);
  window.addEventListener("appinstalled", installed);
  standalone.addEventListener("change", modeChanged);
  const stopWaiting = waitForReaderUse(() => {
    ready = true;
    show();
  });
  return () => {
    disposed = true;
    stopOverlays();
    stopWaiting();
    stopLanguage();
    window.removeEventListener("beforeinstallprompt", beforeInstall);
    window.removeEventListener("appinstalled", installed);
    standalone.removeEventListener("change", modeChanged);
    remove();
  };
}

function installOverlayOpen(): boolean {
  return Boolean(
    document.querySelector(
      'dialog[open], [aria-modal="true"], details.reader-menu[open], .library-row-menu, [popover]:popover-open',
    ),
  );
}

function observeInstallOverlays(show: () => void): () => void {
  const overlays = new MutationObserver(show);
  overlays.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["open", "data-state", "aria-expanded"],
  });
  document.addEventListener("toggle", show, true);
  return () => {
    overlays.disconnect();
    document.removeEventListener("toggle", show, true);
  };
}
