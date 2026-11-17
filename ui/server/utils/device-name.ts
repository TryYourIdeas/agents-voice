// Device names double as URL path segments and file names, so they are
// validated before reaching the whatsap API proxy or the new-devices directory.
export const DEVICE_NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/

export function requireDeviceName(name: string | undefined): string {
  if (!name || !DEVICE_NAME_RE.test(name)) {
    throw createError({ statusCode: 400, statusMessage: 'Device name must be lowercase letters, numbers, and dashes only.' })
  }
  return name
}
