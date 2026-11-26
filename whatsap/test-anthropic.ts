// test-anthropic.ts — smoke test of an Anthropic-compatible endpoint with the Anthropic Messages SDK.
// Usage: node test-anthropic.ts [model] [prompt]
// Env: ANTHROPIC_BASE_URL (default http://localhost:1235 — the SDK appends /v1/messages),
//      ANTHROPIC_API_KEY (default "not-needed" for local servers), ANTHROPIC_MODEL (default google/gemma-4-e4b).

import Anthropic from "@anthropic-ai/sdk";

const baseURL = (process.env.ANTHROPIC_BASE_URL ?? "http://localhost:1235").replace(/\/+$/, "").replace(/\/v1(\/messages)?$/, "");
const model = process.argv[2] ?? process.env.ANTHROPIC_MODEL ?? "google/gemma-4-e4b";
const prompt = process.argv[3] ?? "Reply with one short sentence saying hello.";

const client = new Anthropic({ baseURL, apiKey: process.env.ANTHROPIC_API_KEY ?? "not-needed", maxRetries: 0, timeout: 120_000 });

try {
    console.log(`POST ${baseURL}/v1/messages  model=${model}`);
    const msg = await client.messages.create({ model, max_tokens: 256, messages: [{ role: "user", content: prompt }] });
    for (const block of msg.content) if (block.type === "text") console.log(block.text);
    console.log(`stop_reason=${msg.stop_reason} usage=${JSON.stringify(msg.usage)}`);
} catch (e: any) {
    console.error(`Request failed: ${e?.status ?? ""} ${e?.message ?? e}`);
    process.exit(1);
}
