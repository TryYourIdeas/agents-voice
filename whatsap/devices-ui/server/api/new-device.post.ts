import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/

export default defineEventHandler(async (event) => {
    const { newDevicesDir } = useRuntimeConfig()
    const body = await readBody<{ name?: string; label?: string }>(event)
    const name = (body.name || '').trim()
    const label = (body.label || name).trim()

    if (!NAME_RE.test(name)) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Device name must be lowercase letters, numbers, and dashes only.',
        })
    }

    mkdirSync(newDevicesDir, { recursive: true })
    const filePath = path.join(newDevicesDir, `${name}.md`)
    if (existsSync(filePath)) {
        throw createError({
            statusCode: 409,
            statusMessage: `A pending device request named '${name}' already exists.`,
        })
    }
    writeFileSync(filePath, `---\nname: ${name}\nlabel: ${label}\n---\n`, 'utf-8')
    return { name, label }
})
