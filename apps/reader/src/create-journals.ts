import { StorageCreateJournal, type ListableStorage } from "@mdbase-reader/platform";

/** The part of the SDK entry that says when the user signed out. */
export interface SignOutSource {
  getSnapshot(): { readonly signOutResult?: unknown };
  subscribe(listener: () => void): () => void;
}

/** The kept creates of whichever account is signed in on this page. */
export interface CreateJournals {
  /** The signed-in account's creates. Another account never sees or replays them. */
  journalFor(account: string): StorageCreateJournal;
  /**
   * Signing out removes the account's data from this browser (SDK `signOut`), so its kept
   * creates go too: they hold quotes, notes and bodies. Returns the unsubscribe.
   */
  clearOnSignOut(sdk: SignOutSource): () => void;
}

export function createJournals(storage: ListableStorage): CreateJournals {
  /** The account whose creates this page keeps, so signing out can clear them. */
  let account: string | null = null;
  return {
    journalFor(next) {
      account = next;
      return new StorageCreateJournal(storage, next);
    },
    clearOnSignOut(sdk) {
      // `signOutResult` is set by an explicit sign-out and stays until the session starts
      // again (SDK `web-sign-in-session.d.ts`). Only its arrival is a sign-out: a result
      // still showing while another account signs in must not clear that account.
      let signedOut = Boolean(sdk.getSnapshot().signOutResult);
      return sdk.subscribe(() => {
        const now = Boolean(sdk.getSnapshot().signOutResult);
        const arrived = now && !signedOut;
        signedOut = now;
        const leaving = account;
        if (!arrived || leaving === null) {
          return;
        }
        account = null;
        void StorageCreateJournal.clearAccount(storage, leaving).catch(() => undefined);
      });
    },
  };
}
