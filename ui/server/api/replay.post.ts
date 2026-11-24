// POST /api/replay {turnId, modelConfigId} — starts a sandboxed replay in the whatsap bot (answers 202 {replayTurnId}).
// The bot reads the model configuration (including its API key) itself; the key never passes through here.
export default defineEventHandler((event) => {
  const { whatsapApiUrl } = useRuntimeConfig()
  return proxyRequest(event, `${whatsapApiUrl}/api/replay`)
})
