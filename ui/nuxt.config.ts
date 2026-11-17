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
    // whatsap bot's internal API (device list/status, QR image, reconnect) and the directory it watches
    // for new-device requests. Override at runtime with NUXT_WHATSAP_API_URL / NUXT_NEW_DEVICES_DIR.
    whatsapApiUrl: process.env.WHATSAP_API_URL || 'http://localhost:4001',
    newDevicesDir: process.env.NEW_DEVICES_DIR || '../whatsap/new-devices',
    agentLogsDb: process.env.AGENT_LOGS_DB || '../logs/agent-logs.db',
  },
})
