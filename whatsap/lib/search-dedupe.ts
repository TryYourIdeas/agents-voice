// Guards against the agent re-running the exact same web search over and over
// (observed: one query repeated 38 times in a row until the recursion limit).
// Tracks queries per conversation thread; a repeat returns a nudge instead of
// hitting the search API again.

const MAX_THREADS = 200;
const seenByThread = new Map<string, Map<string, number>>();

export function normalizeQuery(query: string, topic?: string): string {
    return `${topic ?? "general"}|${query.trim().toLowerCase().replace(/\s+/g, " ")}`;
}

// Returns undefined for a fresh query, or the number of times it was already
// seen (>= 1) for a repeat. Records the query either way.
export function recordSearch(threadId: string | undefined, query: string, topic?: string): number | undefined {
    const key = threadId ?? "no-thread";
    let seen = seenByThread.get(key);
    if (!seen) {
        seen = new Map();
        seenByThread.set(key, seen);
        // Scheduled runs use a fresh thread id each firing; evict the oldest.
        if (seenByThread.size > MAX_THREADS) seenByThread.delete(seenByThread.keys().next().value!);
    }
    const norm = normalizeQuery(query, topic);
    const prior = seen.get(norm);
    seen.set(norm, (prior ?? 0) + 1);
    return prior;
}

export function duplicateSearchMessage(query: string, timesSeen: number): string {
    return (
        `You already ran web_search for "${query}" in this conversation${timesSeen > 1 ? ` (${timesSeen} times)` : ""}; ` +
        `repeating it returns the same results. Use the results you already have, try a clearly different query, ` +
        `or stop searching and write your answer now.`
    );
}

export function resetSearchDedupe(): void {
    seenByThread.clear();
}
