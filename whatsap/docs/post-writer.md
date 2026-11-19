# Post writer (post-writer agent + generate-posts)

Ask the bot to create a post with an image; it writes the prompt, runs the sibling
`web/generate-posts` pipeline and publishes the result as a **draft** article on tryyourideas.com.

## Usage
- `@ai @agent post-writer write a post about the index.md hub pattern, with a funny image`
- `@ai @agent post-writer generate a helpful post on https://example.com/article`
- The default agent also delegates "write/publish a post ..." requests to `post-writer`.
- Tell it "don't publish" to generate the files only (`--no-post`).

## Flow
1. The agent writes a raw prompt (skill `post-prompt-writing`: topic, angle, audience, image style).
2. `post_queue_prompt` saves it as `generate-posts/prompts-post/pending/<name>.md`.
3. `post_run_pipeline` runs `node post-with-image.js` (post, humanize, metadata, image, draft publish; several minutes).
4. The agent replies with the title, slug, publish status and output folder `prompts-post/output/<name>/`.

## Setup
- `generate-posts` needs its own `npm install` and `.env` (Alibaba keys, `PUBLISH_POST_API_KEY`, S3) on the host.
- Docker: each `whatsap-*-docker-compose.yml` mounts `../generate-posts` at `/data/generate-posts` and sets
  `GENERATE_POSTS_DIR`. Outside Docker the default is `../generate-posts` (relative to `whatsap/`).
- Optional `GENERATE_POSTS_TIMEOUT_MS` (default 25 minutes).

## Safety notes
- The pipeline processes the whole `pending/` queue, so the tools **refuse to queue or run while any other
  prompt is in `pending/` or `in-progress/`**. Clear or run old prompts first.
- Publishing is automatic (chosen on purpose, no chat confirmation) but only creates a draft. Fetched web
  content is untrusted; the agent is told not to copy instructions from it, but the pipeline itself also
  fetches links, so review drafts before making them live.
- One run at a time.

Code: `lib/generate-posts.ts`, `tools/generate-posts.tool.ts` (named-agent-only, `named-agents.ts`), `agents/post-writer/`.
