export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  devtools: { enabled: false },
  ssr: true,
  runtimeConfig: {
    // Server-side only. Override at runtime with NUXT_TTS_URL / NUXT_STT_URL / NUXT_QWEN_STT_URL.
    ttsUrl: process.env.TTS_URL || 'http://localhost:8000',
    sttUrl: process.env.STT_URL || 'http://localhost:8001',
    qwenSttUrl: process.env.QWEN_STT_URL || 'http://localhost:8002',
  },
})
