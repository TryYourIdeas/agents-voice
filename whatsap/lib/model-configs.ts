// lib/model-configs.ts
//
// Read-only access (by the bot) to the model configurations the UI manages in logs/model-configs.db.
// The api key is returned here because the replay needs it to call the model; it is never logged.

import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

export interface ModelConfig {
    id: number;
    name: string;
    model: string;
    baseUrl: string;
    apiKey: string;
}

export function modelConfigsPath(env: NodeJS.ProcessEnv = process.env): string {
    return env.MODEL_CONFIGS_DB || path.resolve(process.cwd(), "../logs/model-configs.db");
}

export function getModelConfig(id: number, file = modelConfigsPath()): ModelConfig | undefined {
    if (!fs.existsSync(file)) return undefined;
    let db: DatabaseSync | undefined;
    try {
        db = new DatabaseSync(file, { readOnly: true });
        const r = db.prepare("SELECT id, name, model, base_url, api_key FROM model_configs WHERE id = ?").get(id) as any;
        return r ? { id: r.id, name: r.name, model: r.model, baseUrl: r.base_url, apiKey: r.api_key } : undefined;
    } catch (e: any) {
        console.warn(`[model-configs] could not read ${file}: ${e?.message ?? e}`);
        return undefined;
    } finally {
        try { db?.close(); } catch {}
    }
}
