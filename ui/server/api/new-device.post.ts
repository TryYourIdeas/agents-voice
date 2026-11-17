import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { requireDeviceName } from '../utils/device-name'

// POST /api/new-device — asks the whatsap bot to create a device by dropping
// new-devices/<name>.md into the directory it watches (see whatsap/device-onboarding.ts).
export default defineEventHandler(async (event) => {
  const { newDevicesDir } = useRuntimeConfig()
  const body = await readBody<{ name?: string; label?: string }>(event)
  const name = requireDeviceName((body?.name || '').trim())
  // single-line label so it cannot inject extra frontmatter keys
  const label = ((body?.label || name).trim().replace(/[\r\n]+/g, ' ')) || name

  mkdirSync(newDevicesDir, { recursive: true })
  const filePath = path.join(newDevicesDir, `${name}.md`)
  if (existsSync(filePath)) {
    throw createError({ statusCode: 409, statusMessage: `A pending device request named '${name}' already exists.` })
  }
  writeFileSync(filePath, `---\nname: ${name}\nlabel: ${label}\n---\n`, 'utf-8')
  return { name, label }
})
