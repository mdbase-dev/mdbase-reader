import {
  FeedbackProvider,
  feedbackApplication,
  resolveFeedbackEndpoint,
} from "@mdbase-dev/ui/feedback";
import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from "react";

interface FeedbackContextValue {
  readonly view: "connection" | "library" | "document";
  readonly collectionName?: string;
}
const connection: FeedbackContextValue = { view: "connection" };
const Context = createContext<(value: FeedbackContextValue) => void>(() => undefined);

/** Keep the draft above connection and workspace lifetimes; never pass record identities. */
export function FeedbackRoot({ children }: { readonly children: ReactNode }): ReactNode {
  const [context, setContext] = useState(connection);
  return (
    <Context.Provider value={setContext}>
      <FeedbackProvider
        endpoint={resolveFeedbackEndpoint(import.meta.env.VITE_MDBASE_FEEDBACK_URL)}
        turnstileSiteKey={import.meta.env.VITE_MDBASE_FEEDBACK_TURNSTILE_SITE_KEY ?? null}
        application={feedbackApplication(
          "mdbase reader",
          context.view,
          import.meta.env.VITE_MDBASE_READER_BUILD_ID,
          import.meta.env.VITE_MDBASE_ENV ?? (import.meta.env.DEV ? "development" : "production"),
        )}
        {...(context.collectionName ? { collectionName: context.collectionName } : {})}
      >
        {children}
      </FeedbackProvider>
    </Context.Provider>
  );
}

export function useReaderFeedbackContext(documentOpen: boolean, collectionName: string): void {
  const setContext = useContext(Context);
  useLayoutEffect(() => {
    setContext({ view: documentOpen ? "document" : "library", collectionName });
    return () => setContext(connection);
  }, [documentOpen, collectionName, setContext]);
}
