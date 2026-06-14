/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_API_RUNTIME?: "cloud";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
