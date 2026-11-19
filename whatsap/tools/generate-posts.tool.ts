import { tool } from "langchain";
import { z } from "zod";
import { queuePrompt, runPipeline } from "../lib/generate-posts.ts";

// Named-agent-only tools (registered in named-agents.ts, used by the `post-writer` agent).

export const postQueuePromptTool = tool(
  async ({ name, prompt }) => {
    try {
      const { name: n, file } = queuePrompt(name, prompt);
      return `Queued prompt '${n}' (${file}). Call post_run_pipeline to generate it.`;
    } catch (e: any) {
      return `Error: ${e.message}`;
    }
  },
  {
    name: "post_queue_prompt",
    description:
      "Save the raw prompt for a post-with-image in the generate-posts queue (prompts-post/pending/<name>.md). Fails if other prompts are already queued.",
    schema: z.object({
      name: z.string().describe("Short topic name, 2-6 words; becomes the file name and output folder"),
      prompt: z.string().describe("The full raw prompt text for the pipeline"),
    }),
  },
);

export const postRunPipelineTool = tool(
  async ({ publish }) => {
    try {
      const r = await runPipeline({ publish: publish !== false });
      const lines = [
        r.ok ? "Pipeline finished." : "Pipeline FAILED.",
        r.title ? `Title: ${r.title}` : "",
        r.slug ? `Slug: ${r.slug}` : "",
        `Published as draft: ${r.published ? "yes" : "no"}`,
        r.outputDir ? `Output: ${r.outputDir} (${r.files.join(", ")})` : "",
        `--- log tail ---\n${r.logTail}`,
      ];
      return lines.filter(Boolean).join("\n");
    } catch (e: any) {
      return `Error: ${e.message}`;
    }
  },
  {
    name: "post_run_pipeline",
    description:
      "Run the generate-posts pipeline on the queued prompt: writes the post, humanizes it, builds metadata, generates the image and (by default) publishes it as a DRAFT article on tryyourideas.com. Takes several minutes.",
    schema: z.object({
      publish: z.boolean().optional().describe("Publish the draft article (default true). false = generate files only."),
    }),
  },
);
