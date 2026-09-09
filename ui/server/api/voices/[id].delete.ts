export default defineEventHandler((event) => {
  const { ttsUrl } = useRuntimeConfig()
  const id = getRouterParam(event, 'id')
  return proxyRequest(event, `${ttsUrl}/voices/${encodeURIComponent(id ?? '')}`)
})
