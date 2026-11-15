import { useLingui } from "@lingui/react/macro";
import { OpeningScreen } from "@mdbase-dev/ui/screens";

import { useReaderMdbase } from "./reader-collections.js";

/**
 * Reader's opening screen, the shared one index.html paints before any script runs
 * (see `mdbaseOpeningPage` in vite.config.ts). Once the collection is known, it says which.
 */
export function ReaderBoot({
  collectionName,
}: {
  readonly collectionName?: string;
}): React.JSX.Element {
  const { t } = useLingui();
  const snapshot = useReaderMdbase()?.getSnapshot();
  const name =
    collectionName ??
    snapshot?.collections.find(({ collectionId }) => collectionId === snapshot.selectedCollectionId)
      ?.displayName;
  return <OpeningScreen app="reader" title={t`Opening your library`} detail={name} />;
}
