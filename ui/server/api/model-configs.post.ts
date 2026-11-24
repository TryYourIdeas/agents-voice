import { createConfig, requireConfigsDb, toHttpError } from '../utils/model-configs-db'

// POST /api/model-configs {name, model, base_url, api_key}
export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const id = createConfig(requireConfigsDb(event), body ?? {})
    if (process.env.NUXT_ADD_DEBUG_LOGS) console.log(`[model-configs] created id=${id} name=${body?.name}`)
    return { id }
  } catch (e) { throw toHttpError(e) }
})
