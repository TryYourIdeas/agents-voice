// list-models.ts — lists the models served by an OpenAI-compatible endpoint.
// Usage: node list-models.ts [baseUrl]
// Base URL: argument, else OPENAI_BASE_URL, else http://localhost:1235/v1. Optional OPENAI_API_KEY.

const baseUrl = (process.argv[2] ?? process.env.OPENAI_BASE_URL ?? "http://localhost:1235/v1").replace(/\/+$/, "");
const apiKey = process.env.OPENAI_API_KEY;

try {
    const res = await fetch(`${baseUrl}/models`, {
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
        signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}: ${(await res.text()).slice(0, 300)}`);
    const body = (await res.json()) as { data?: { id: string; owned_by?: string }[] };
    const models = body.data ?? [];
    console.log(`${models.length} model(s) at ${baseUrl}`);
    for (const m of models) console.log(`- ${m.id}${m.owned_by ? ` (${m.owned_by})` : ""}`);
} catch (e: any) {
    console.error(`Could not list models at ${baseUrl}/models: ${e?.cause?.code ?? e?.message ?? e}`);
    process.exit(1);
}
