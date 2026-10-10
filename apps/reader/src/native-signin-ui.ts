import { AppWebSignInSession } from "@mdbase-dev/sdk/app-host";

import type {
  AppWebSignInSessionOptions,
  AppWebSignInSnapshot,
  AppWebSignInPortal,
} from "@mdbase-dev/sdk/app-host";

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
  unavailable: "Opening collections isn't available in this build yet.",
});
export class SignInTabBlocked extends Error {
  constructor() {
    super(signInCopy.tabBlocked);
  }
}

/** UI portal only. Navigation URI comes from the SDK. */
export function openSignInPortal(): AppWebSignInPortal {
  const tab = window.open("about:blank", "_blank");
  if (!tab) {
    throw new SignInTabBlocked();
  }
  tab.opener = null;
  return {
    navigate(uri): void {
      tab.location.replace(uri);
    },
    close(): void {
      tab.close();
    },
  };
}
export interface SignInPortalUi {
  reserve: () => void;
  open: () => AppWebSignInPortal;
  cancel: () => void;
}
export function createSignInPortalUi(): SignInPortalUi {
  let reserved: AppWebSignInPortal | null = null;
  return {
    reserve(): void {
      reserved ??= openSignInPortal();
    },
    open(): AppWebSignInPortal {
      const portal = reserved ?? openSignInPortal();
      reserved = null;
      return portal;
    },
    cancel(): void {
      reserved?.close();
      reserved = null;
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
