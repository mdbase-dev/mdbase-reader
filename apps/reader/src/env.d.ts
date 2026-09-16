/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MDBASE_ENV?: string;
  readonly VITE_MDBASE_CONNECT_URL?: string;
  readonly VITE_MDBASE_CONNECT_LOOPBACK_URL?: string;
  readonly VITE_MDBASE_READER_BUILD_ID?: string;
}
