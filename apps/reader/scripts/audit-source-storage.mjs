export async function blockSourceDraftStorage(page, blocked) {
  await page.evaluate((value) => {
    const prototype = globalThis.Storage.prototype;
    globalThis.__readerOriginalStorageWrite ??= prototype.setItem;
    const original = globalThis.__readerOriginalStorageWrite;
    prototype.setItem = value
      ? function (key, body) {
          if (key.startsWith("mdbase-reader:draft:v1:"))
            throw new Error("[test] Local storage unavailable");
          return original.call(this, key, body);
        }
      : original;
  }, blocked);
}
