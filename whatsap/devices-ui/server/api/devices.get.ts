export default defineEventHandler((event) => {
    const { whatsapApiUrl } = useRuntimeConfig()
    return proxyRequest(event, `${whatsapApiUrl}/api/devices`)
})
