import { requireDeviceName } from '../../../utils/device-name'

export default defineEventHandler((event) => {
  const { whatsapApiUrl } = useRuntimeConfig()
  const name = requireDeviceName(getRouterParam(event, 'name'))
  return proxyRequest(event, `${whatsapApiUrl}/api/devices/${name}/qr.png`)
})
