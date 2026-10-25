import { AppWebSignInSession } from "@mdbase-dev/sdk-legacy-729b5391/app-host";

import { openConnectPopup, type ConnectPopup } from "./connect-popup.js";

import type {
  AppWebSignInSessionOptions,
  AppWebSignInSnapshot,
  AppWebSignInPortal,
} from "@mdbase-dev/sdk-legacy-729b5391/app-host";
export { ConnectPopupBlocked as SignInTabBlocked } from "./connect-popup.js";

export type NativeSignInSession = Pick<
  AppWebSignInSession<never>,
  | "getSnapshot"
  | "subscribe"
  | "start"
  | "authorize"
  | "renewExpiredPairing"
  | "forget"
  | "close"
  | "setForeground"
>;
export const signInCopy = Object.freeze({
  signIn: "Sign in",
  waiting: "Waiting for approval in the mdbase tab…",
  reopen: "Open the mdbase tab again",
  tabBlocked: "Your browser blocked the sign-in tab.",
  openSignIn: "Open sign-in",
  interrupted: "Sign-in was interrupted. Please try again.",
  signOut: "Sign out",
  unavailable: "Opening collections isn’t available in this build yet.",
});
/** UI portal only. Navigation URI comes from the SDK. */
export const openSignInPortal = openConnectPopup;

// Popup names are UI ownership identities, never native IDs or namespaces.
let nextPortalKey = 0;
export interface SignInPortalUi {
  reserve: () => void;
  open: () => AppWebSignInPortal;
  cancel: () => void;
}
export function createSignInPortalUi(): SignInPortalUi {
  const name = `mdbase-reader-connect-${String(++nextPortalKey)}`;
  let active: ConnectPopup | null = null;
  return {
    reserve(): void {
      if (!active || active.closed) {
        active = openSignInPortal(name);
      }
    },
    open(): AppWebSignInPortal {
      if (!active || active.closed) {
        active = openSignInPortal(name);
      }
      return active;
    },
    cancel(): void {
      const original = active;
      active = null;
      original?.close();
    },
  };
}
// React identity only, never a native actor/record/mutation ID.
let nextViewKey = 0;
export interface NativeSignInBinding {
  session: NativeSignInSession;
  portal: SignInPortalUi;
  viewKey: number;
}
/** Public SDK constructor, no collection/SQL/auth engine. */
export function createNativeSignIn(
  options: Omit<AppWebSignInSessionOptions<never>, "openPortal" | "openCollection" | "autoSelect">,
): NativeSignInBinding {
  options.signal.throwIfAborted();
  const portal = createSignInPortalUi();
  const session = new AppWebSignInSession<never>({
    ...options,
    openPortal: portal.open,
    openCollection: unavailableCollection,
    autoSelect: "never",
  });
  return { session, portal, viewKey: ++nextViewKey };
}
/** Reservation precedes every asynchronous SDK action. */
export async function authorizeNativeSignIn(
  session: NativeSignInSession,
  portal: SignInPortalUi,
): Promise<AppWebSignInSnapshot> {
  portal.reserve();
  try {
    if (session.getSnapshot().status === "not_started") {
      await session.start();
    }
    if (session.getSnapshot().problem === "expired") {
      await session.renewExpiredPairing();
    }
    return await session.authorize();
  } catch (error) {
    portal.cancel();
    throw error;
  }
}
/** Never manufactures a connection or setup result; original cancellation wins. */
export const unavailableCollection: AppWebSignInSessionOptions<never>["openCollection"] = ({
  signal,
}): Promise<never> =>
  Promise.resolve().then(() => {
    signal.throwIfAborted();
    throw new Error(signInCopy.unavailable);
  });

interface SignInPresentation {
  message: string;
  identity: string | null;
  waiting: boolean;
  paired: boolean;
  unavailable: boolean;
  error: boolean;
  action: string;
  disabled: boolean;
}
function messageFor(
  snapshot: AppWebSignInSnapshot,
  appName: string,
  problem: "tab_blocked" | "interrupted" | null,
  identity: string | null,
  paired: boolean,
): string {
  if (problem === "tab_blocked") {
    return signInCopy.tabBlocked;
  }
  if (problem === "interrupted" || snapshot.status === "blocked") {
    return signInCopy.interrupted;
  }
  if (snapshot.status === "authorizing") {
    return signInCopy.waiting;
  }
  const selected = snapshot.collections.find(
    ({ collectionId }) => collectionId === snapshot.selectedCollectionId,
  );
  if (snapshot.status === "opening" && selected) {
    return `Signed in. Opening ${selected.displayName}…`;
  }
  if (identity) {
    return identity;
  }
  return paired
    ? signInCopy.unavailable
    : `Sign in with your mdbase account to sync ${appName} across your devices.`;
}
export function signInPresentation(
  snapshot: AppWebSignInSnapshot,
  appName: string,
  problem: "tab_blocked" | "interrupted" | null = null,
): SignInPresentation {
  const signIn =
    snapshot.status !== "closed" && snapshot.signIn?.state === "paired" ? snapshot.signIn : null;
  const email = signIn?.accountEmail;
  const identity = email ? `Signed in as ${email}` : null;
  const paired = signIn !== null;
  const message = messageFor(snapshot, appName, problem, identity, paired);
  return {
    message,
    identity: identity === message ? null : identity,
    waiting: snapshot.status === "authorizing" && problem === null,
    paired,
    unavailable: paired && message !== signInCopy.unavailable,
    error: problem !== null || snapshot.status === "blocked",
    action: problem === "tab_blocked" ? signInCopy.openSignIn : signInCopy.signIn,
    disabled: ["starting", "opening", "closed"].includes(snapshot.status),
  };
}
