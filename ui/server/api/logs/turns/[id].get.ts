import { getTurn } from '../../../utils/agent-logs-db'
import { requireLogsDb } from '../../../utils/logs-db-handle'

// GET /api/logs/turns/:id — the turn, its ordered events, and sub-agent turns (nested).
export default defineEventHandler((event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id < 1) throw createError({ statusCode: 400, statusMessage: 'Invalid turn id' })
  const turn = getTurn(requireLogsDb(event), id)
  if (!turn) throw createError({ statusCode: 404, statusMessage: `Turn ${id} not found` })
  return turn
})
