import { getSandbox } from '../../../../utils/agent-logs-db'
import { requireLogsDb } from '../../../../utils/logs-db-handle'

// GET /api/logs/turns/:id/sandbox — the mock chat, files and mailbox a replay ended up with.
export default defineEventHandler((event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id < 1) throw createError({ statusCode: 400, statusMessage: 'Invalid turn id' })
  return getSandbox(requireLogsDb(event), id)
})
