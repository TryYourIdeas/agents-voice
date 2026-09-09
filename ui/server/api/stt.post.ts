export default defineEventHandler((event) => {
  const { sttUrl, qwenSttUrl } = useRuntimeConfig()
  // Engine choice travels via query string so it can be read without
  // consuming the multipart body stream that proxyRequest forwards untouched.
  const { engine } = getQuery(event)
  const baseUrl = engine === 'qwen' ? qwenSttUrl : sttUrl
  // Streams multipart/form-data through, preserving the Content-Type boundary.
  return proxyRequest(event, `${baseUrl}/stt`)
})
