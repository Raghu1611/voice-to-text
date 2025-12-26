/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_DEEPGRAM_KEY: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}
