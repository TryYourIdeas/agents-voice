export default defineEventHandler((event) => {
    const { whatsapApiUrl } = useRuntimeConfig()
    const name = getRouterParam(event, 'name')
    return proxyRequest(event, `${whatsapApiUrl}/api/devices/${name}/reconnect`)
})
