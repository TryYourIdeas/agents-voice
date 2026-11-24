import { updateConfig, requireConfigsDb, toHttpError } from '../../utils/model-configs-db'

// PUT /api/model-configs/:id — a blank api_key keeps the stored key.
export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id < 1) throw createError({ statusCode: 400, statusMessage: 'Invalid id.' })
  try {
    updateConfig(requireConfigsDb(event), id, (await readBody(event)) ?? {})
    if (process.env.NUXT_ADD_DEBUG_LOGS) console.log(`[model-configs] updated id=${id}`)
    return { ok: true }
  } catch (e) { throw toHttpError(e) }
})
