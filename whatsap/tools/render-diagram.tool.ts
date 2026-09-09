import { tool } from "langchain";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { resolveDeviceScopedPath } from "../lib/device-scoped-path.ts";

const PLANTUML_URL = process.env.PLANTUML_URL || "http://localhost:3000";

// Marker the WhatsApp layer (index.ts) scans the agent's final reply for —
// see its handling of [[DIAGRAM:...]] tags. This tool only renders and
// saves the image; the agent must include the tag itself for the image to
// actually reach the user, since a tool result is just data the agent sees,
// not something sent to the user directly.
export function diagramMarker(filePath: string): string {
    return `[[DIAGRAM:${filePath}]]`;
}

export const renderDiagramTool = tool(
    async ({ diagram, format = "png" }: { diagram: string; format?: "svg" | "png" }, config) => {
        console.log(`Rendering PlantUML diagram (${format}, ${diagram.length} chars)`);

        const response = await fetch(`${PLANTUML_URL}/render`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ diagram, format }),
        });

        if (!response.ok) {
            const body = await response.text();
            return `Failed to render diagram: HTTP ${response.status} — ${body.slice(0, 300)}. Fix the PlantUML syntax and try again, or tell the user it could not be rendered.`;
        }

        const bytes = Buffer.from(await response.arrayBuffer());
        // Rendered under this device's own directory (diagrams/), same as
        // every other file-producing tool — see lib/device-scoped-path.ts.
        const filePath = resolveDeviceScopedPath(config, path.join("diagrams", `${randomUUID()}.${format}`));
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, bytes);

        // Deliberately short and free of further instructions: an earlier,
        // longer version repeated "you must..." guidance in every result,
        // and weaker models (observed with the local llama-server model)
        // read that as a cue to keep calling the tool rather than stopping
        // — it looped until hitting the graph's recursion limit even though
        // every single call had already succeeded. The stop instruction now
        // lives only in the tool description and agent.md, said once.
        return `Rendered. Tag: ${diagramMarker(filePath)}`;
    },
    {
        name: "render_diagram",
        description:
            "Render a PlantUML diagram (sequence, component, class, etc.) to an image, once. " +
            "Input must be a complete PlantUML definition starting with @startuml and ending with @enduml. " +
            "Call this AT MOST ONCE per diagram. As soon as it returns, write your final reply " +
            "immediately, including the returned tag verbatim — do not call this tool again for " +
            "the same diagram, and do not call it again just to double-check or retry a success.",
        schema: z.object({
            diagram: z.string().describe("Complete PlantUML source, including @startuml/@enduml"),
            format: z.enum(["svg", "png"]).optional().describe("Output format — png (default) displays inline in WhatsApp; svg is higher quality but not always previewable"),
        }),
    }
);
