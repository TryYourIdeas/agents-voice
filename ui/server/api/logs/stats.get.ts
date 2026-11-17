import { getStats } from '../../utils/agent-logs-db'
import { requireLogsDb } from '../../utils/logs-db-handle'

// GET /api/logs/stats — totals, per-agent, per-tool and token usage.
export default defineEventHandler((event) => getStats(requireLogsDb(event)))
