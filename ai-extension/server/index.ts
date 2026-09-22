import "dotenv/config";
import { createApp } from "./http.ts";

const extensionId = process.env.EXTENSION_ID;
if (!extensionId) {
    throw new Error("EXTENSION_ID environment variable is required — see .env.example");
}

const port = process.env.PORT ? Number(process.env.PORT) : 4100;
const maxContextChars = process.env.MAX_CONTEXT_CHARS ? Number(process.env.MAX_CONTEXT_CHARS) : 20000;

const app = createApp({ extensionId, maxContextChars });
app.listen(port, () => {
    console.log(`[ai-extension] server listening on http://localhost:${port}`);
});
