export default defineEventHandler((event) => {
  const { ttsUrl } = useRuntimeConfig()
  // Streams multipart/form-data through, preserving the Content-Type boundary.
  return proxyRequest(event, `${ttsUrl}/voices/clone`)
})
