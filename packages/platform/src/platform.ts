export type PlatformKind = "web" | "electron" | "capacitor";

export interface PickedFile {
  readonly name: string;
  readonly mediaType: string;
  readonly size: number;
  readonly bytes: ArrayBuffer;
}

export interface KeyValueStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface ReaderPlatform {
  readonly kind: PlatformKind;
  readonly storage: KeyValueStorage;
  pickFile(accept: readonly string[]): Promise<PickedFile | null>;
  saveFile(name: string, blob: Blob): Promise<void>;
  openExternal(url: URL): Promise<void>;
}

export class MemoryStorage implements KeyValueStorage {
  readonly #values = new Map<string, string>();

  get(key: string): Promise<string | null> {
    return Promise.resolve(this.#values.get(key) ?? null);
  }

  set(key: string, value: string): Promise<void> {
    this.#values.set(key, value);
    return Promise.resolve();
  }

  remove(key: string): Promise<void> {
    this.#values.delete(key);
    return Promise.resolve();
  }
}
