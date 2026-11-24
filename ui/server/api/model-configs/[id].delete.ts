import { deleteConfig, requireConfigsDb, toHttpError } from '../../utils/model-configs-db'

// DELETE /api/model-configs/:id — logs keep the model NAME on each turn, so past logs are unaffected.
export default defineEventHandler((event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id < 1) throw createError({ statusCode: 400, statusMessage: 'Invalid id.' })
  try {
    deleteConfig(requireConfigsDb(event), id)
    if (process.env.NUXT_ADD_DEBUG_LOGS) console.log(`[model-configs] deleted id=${id}`)
    return { ok: true }
  } catch (e) { throw toHttpError(e) }
})
