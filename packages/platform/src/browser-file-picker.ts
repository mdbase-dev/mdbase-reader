import type { PickedFile } from "./platform.js";

export function pickBrowserFile(accept: readonly string[]): Promise<PickedFile | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept.join(",");
    input.hidden = true;
    const finish = (value: PickedFile | null): void => {
      input.remove();
      resolve(value);
    };
    const fail = (reason: unknown): void => {
      input.remove();
      reject(
        reason instanceof Error ? reason : new Error("Reader could not read the selected file."),
      );
    };
    input.addEventListener(
      "change",
      () => {
        const file = input.files?.[0];
        if (!file) {
          finish(null);
          return;
        }
        void file
          .arrayBuffer()
          .then(
            (bytes) => finish({ name: file.name, mediaType: file.type, size: file.size, bytes }),
            fail,
          );
      },
      { once: true },
    );
    input.addEventListener("cancel", () => finish(null), { once: true });
    document.body.append(input);
    input.click();
  });
}
