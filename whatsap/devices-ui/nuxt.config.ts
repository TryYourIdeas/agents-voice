export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  devtools: { enabled: false },
  ssr: true,
  runtimeConfig: {
    // process.env.WHATSAP_API_URL / NEW_DEVICES_DIR here are read once at
    // build/dev-start time — enough for local `nuxt dev`, but a *built*
    // image (what docker-compose actually runs) needs Nuxt's own runtime
    // override mechanism instead: an env var named NUXT_<KEY_IN_SCREAMING_
    // SNAKE_CASE> overrides the matching runtimeConfig key at server start,
    // regardless of what got baked in at build time. See
    // docker-compose-whatsap.yml's devices-ui service, which sets
    // NUXT_WHATSAP_API_URL / NUXT_NEW_DEVICES_DIR for exactly this reason —
    // same pattern the root repo's ui/ service already relies on
    // (NUXT_TTS_URL etc., see its nuxt.config.ts).
    whatsapApiUrl: process.env.WHATSAP_API_URL || 'http://localhost:4001',
    newDevicesDir: process.env.NEW_DEVICES_DIR || '/data/new-devices',
  },
})
