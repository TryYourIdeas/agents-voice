import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import { z } from "zod";
import { callAgent } from "./agent.ts";
import { formatContext, type PageContext } from "./context.ts";

const chatRequestSchema = z.object({
    message: z.string().min(1),
    threadId: z.string().min(1),
    context: z
        .object({
            type: z.enum(["selection", "page"]),
            text: z.string(),
            url: z.string(),
        })
        .optional(),
});

export interface AppConfig {
    extensionId: string;
    maxContextChars: number;
}

export function createApp({ extensionId, maxContextChars }: AppConfig): Express {
    const app = express();
    app.use(express.json());
    const allowedOrigin = `chrome-extension://${extensionId}`;
    app.use(
        cors({
            origin: (origin, callback) => {
                if (!origin || origin === allowedOrigin) {
                    callback(null, true);
                    return;
                }
                callback(new Error("Not allowed by CORS"));
            },
        })
    );

    app.get("/health", (_req, res) => {
        res.json({ status: "ok" });
    });

    app.post("/api/chat", async (req, res) => {
        const parsed = chatRequestSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: parsed.error.message });
            return;
        }

        const { message, threadId, context } = parsed.data;
        const formatted = formatContext(context as PageContext | undefined, maxContextChars);
        const fullMessage = formatted ? `${formatted}\n\n${message}` : message;

        try {
            const reply = await callAgent(fullMessage, threadId);
            res.json({ reply });
        } catch (error) {
            console.error("[ai-extension] agent call failed:", error);
            res.status(500).json({ error: "Agent call failed" });
        }
    });

    app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
        if (err.message === "Not allowed by CORS") {
            res.status(403).json({ error: "Forbidden" });
            return;
        }
        res.status(500).json({ error: "Internal error" });
    });

    return app;
}
