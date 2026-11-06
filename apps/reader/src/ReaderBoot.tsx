import html from "../index.html?raw";

const skeleton = /<main class="reader-boot"[\s\S]*?<\/main>/u.exec(html);
if (!skeleton) {
  throw new Error("Reader's loading surface is missing from index.html.");
}
const markup = skeleton[0];

export function ReaderBoot(): React.JSX.Element {
  return <div dangerouslySetInnerHTML={{ __html: markup }} />;
}
