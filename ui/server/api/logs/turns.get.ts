import { listTurns } from '../../utils/agent-logs-db'
import { requireLogsDb } from '../../utils/logs-db-handle'

// GET /api/logs/turns?agent=&status=&source=&q=&includeDelegated=1&limit=&offset=
export default defineEventHandler((event) => {
  const q = getQuery(event)
  const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined)
  return listTurns(requireLogsDb(event), {
    agent: str(q.agent),
    status: str(q.status),
    source: str(q.source),
    q: str(q.q),
    includeDelegated: q.includeDelegated === '1' || q.includeDelegated === 'true',
    limit: q.limit as any,
    offset: q.offset as any,
  })
})
