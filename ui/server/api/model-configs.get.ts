import { listConfigs, requireConfigsDb, toHttpError } from '../utils/model-configs-db'

// GET /api/model-configs — never includes api keys (only has_key / key_tail).
export default defineEventHandler((event) => {
  try { return listConfigs(requireConfigsDb(event)) } catch (e) { throw toHttpError(e) }
})
