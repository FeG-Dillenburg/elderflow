/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_E2EE_EVIDENCE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
