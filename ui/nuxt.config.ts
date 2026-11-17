export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  devtools: { enabled: false },
  ssr: true,
  runtimeConfig: {
    // Server-side only. Override at runtime with NUXT_TTS_URL / NUXT_STT_URL / NUXT_QWEN_STT_URL.
    ttsUrl: process.env.TTS_URL || 'http://localhost:8000',
    sttUrl: process.env.STT_URL || 'http://localhost:8001',
    qwenSttUrl: process.env.QWEN_STT_URL || 'http://localhost:8002',
    // SQLite agent log written by whatsap/ (see whatsap/docs/agent-logs.md); opened read-only.
    // Override at runtime with NUXT_AGENT_LOGS_DB.
    agentLogsDb: process.env.AGENT_LOGS_DB || '../logs/agent-logs.db',
  },
})
