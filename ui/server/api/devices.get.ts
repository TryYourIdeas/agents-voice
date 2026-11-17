// GET /api/devices — device list/status from the whatsap bot's internal API.
export default defineEventHandler((event) => {
  const { whatsapApiUrl } = useRuntimeConfig()
  return proxyRequest(event, `${whatsapApiUrl}/api/devices`)
})
