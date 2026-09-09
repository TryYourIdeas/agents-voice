export default defineEventHandler((event) => {
  const { ttsUrl } = useRuntimeConfig()
  return proxyRequest(event, `${ttsUrl}/tts`, {
    // Streams body and headers through; preserves audio/wav content-type.
    fetchOptions: { redirect: 'manual' },
  })
})
