import { openLogsDb } from './agent-logs-db'

/** Shared by the /api/logs routes: the open DB, or a 503 explaining where it looked. */
export function requireLogsDb(event: Parameters<typeof useRuntimeConfig>[0]) {
  const path = useRuntimeConfig(event).agentLogsDb as string
  const db = openLogsDb(path)
  if (!db) {
    throw createError({ statusCode: 503, statusMessage: `Agent log database not found at ${path}. Start the bot (it creates it on the first message) and set NUXT_AGENT_LOGS_DB / AGENT_LOGS_DB if it lives elsewhere.` })
  }
  return db
}
