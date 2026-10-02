/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MDBASE_ENV?: string;
  readonly VITE_MDBASE_FEEDBACK_URL?: string;
  readonly VITE_MDBASE_FEEDBACK_TURNSTILE_SITE_KEY?: string;
  readonly VITE_MDBASE_CONNECT_URL?: string;
  readonly VITE_MDBASE_CONNECT_LOOPBACK_URL?: string;
  readonly VITE_MDBASE_READER_BUILD_ID?: string;
  readonly VITE_MDBASE_EDITOR_URL?: string;
  readonly VITE_MDBASE_READER_URL?: string;
  readonly VITE_MDBASE_WRITER_URL?: string;
}
