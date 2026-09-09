export default defineEventHandler((event) => {
  const { ttsUrl } = useRuntimeConfig()
  return proxyRequest(event, `${ttsUrl}/voices`)
})
