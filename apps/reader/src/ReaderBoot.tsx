import html from "../index.html?raw";

import { useReaderMdbase } from "./reader-collections.js";

const skeleton = /<main class="reader-boot"[\s\S]*?<\/main>/u.exec(html);
if (!skeleton) {
  throw new Error("Reader's loading surface is missing from index.html.");
}
const markup = skeleton[0];

export function ReaderBoot({
  collectionName,
}: {
  readonly collectionName?: string;
}): React.JSX.Element {
  const snapshot = useReaderMdbase()?.getSnapshot();
  const name =
    collectionName ??
    snapshot?.collections.find(({ collectionId }) => collectionId === snapshot.selectedCollectionId)
      ?.displayName;
  return (
    <div
      ref={(host) => {
        const header = host?.querySelector("header");
        if (header && name) {
          header.textContent = name;
        }
      }}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
