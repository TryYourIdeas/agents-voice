import { describe, it, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getModelConfig } from "./model-configs.ts";

function tmpDb() {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "mc-")), "model-configs.db");
    const d = new DatabaseSync(file);
    d.exec("CREATE TABLE model_configs (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, model TEXT NOT NULL, base_url TEXT NOT NULL, api_key TEXT NOT NULL DEFAULT '', created_at TEXT, updated_at TEXT)");
    d.prepare("INSERT INTO model_configs (name, model, base_url, api_key) VALUES ('lfm', 'LFM3-1.7B', 'http://llama:5050', 'k')").run();
    d.close();
    return file;
}

describe("getModelConfig", () => {
    it("returns the configuration with camelCase fields", () => {
        expect(getModelConfig(1, tmpDb())).toEqual({ id: 1, name: "lfm", model: "LFM3-1.7B", baseUrl: "http://llama:5050", apiKey: "k" });
    });
    it("returns undefined for a missing id", () => {
        expect(getModelConfig(99, tmpDb())).toBeUndefined();
    });
    it("returns undefined when the file does not exist", () => {
        expect(getModelConfig(1, "/nonexistent/dir/x.db")).toBeUndefined();
    });
});

describe("effectiveApiKey", () => {
    it("falls back to a placeholder when the configuration has no key (llama-server ignores it)", async () => {
        const { effectiveApiKey } = await import("./model-configs.ts");
        expect(effectiveApiKey("")).toBe("not-needed");
        expect(effectiveApiKey("  ")).toBe("not-needed");
        expect(effectiveApiKey("sk-real")).toBe("sk-real");
    });
});
