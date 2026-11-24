<script setup lang="ts">
// One agent turn with its ordered events; sub-agent turns render recursively.
// App-specific (shaped by the /api/logs/turns/:id response), so it stays in ui/.
const props = defineProps<{ turn: Record<string, any> }>()

const pretty = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v, null, 2))
const fmt = (n: unknown) => (n == null ? '—' : Number(n).toLocaleString('en-US'))
const toolCalls = (e: Record<string, any>) => (e.data && Array.isArray(e.data.tool_calls) ? e.data.tool_calls : [])
</script>

<template>
  <section class="turn" :aria-label="`Turn ${props.turn.id} (${props.turn.agent})`">
    <header class="turn-head">
      <strong>#{{ props.turn.id }} · {{ props.turn.agent }}</strong>
      <span class="badge" :class="`st-${props.turn.status}`">{{ props.turn.status }}</span>
      <span v-if="props.turn.reasoning_model" class="muted" data-testid="turn-model">model {{ props.turn.reasoning_model }}</span>
      <span v-if="props.turn.replay_of" class="muted">replay of #{{ props.turn.replay_of }}</span>
      <span class="muted">{{ props.turn.source }} · {{ props.turn.duration_ms ?? '?' }} ms · {{ props.turn.started_at }}</span>
      <span v-if="props.turn.tokens" class="muted" data-testid="turn-tokens">
        tokens in {{ fmt(props.turn.tokens.input_tokens) }} / out {{ fmt(props.turn.tokens.output_tokens) }}<template
          v-if="props.turn.children?.length"> (with sub-agents: in {{ fmt(props.turn.tokens_total.input_tokens) }} / out {{ fmt(props.turn.tokens_total.output_tokens) }})</template>
      </span>
    </header>

    <h4>User message</h4>
    <pre class="block">{{ props.turn.user_message }}</pre>

    <h4>Steps</h4>
    <ol class="events">
      <li v-for="e in props.turn.events" :key="e.id" :class="['event', e.kind, { err: e.status === 'error' }]">
        <div class="event-head">
          <span class="badge">{{ e.kind === 'model' ? 'model' : `tool: ${e.name}` }}</span>
          <span class="muted">{{ e.duration_ms ?? '?' }} ms<template v-if="e.status === 'error'"> · error</template><template v-if="e.truncated"> · truncated</template></span>
        </div>
        <template v-if="e.kind === 'model'">
          <pre v-if="e.content" class="block">{{ e.content }}</pre>
          <details v-if="e.data?.thinking"><summary>Thinking</summary><pre class="block">{{ e.data.thinking }}</pre></details>
          <div v-for="c in toolCalls(e)" :key="c.id" class="muted">→ calls <code>{{ c.name }}</code> <code>{{ JSON.stringify(c.args) }}</code></div>
          <div v-if="e.data?.usage" class="muted">tokens in {{ fmt(e.data.usage.input_tokens) }} / out {{ fmt(e.data.usage.output_tokens) }}</div>
        </template>
        <template v-else>
          <details><summary>Arguments</summary><pre class="block">{{ pretty(e.input) }}</pre></details>
          <details open><summary>Result</summary><pre class="block">{{ e.content }}</pre></details>
        </template>
      </li>
    </ol>

    <h4>Final response</h4>
    <pre v-if="props.turn.final_response" class="block">{{ props.turn.final_response }}</pre>
    <pre v-if="props.turn.error" class="block err-text">{{ props.turn.error }}</pre>

    <div v-if="props.turn.children?.length" class="children">
      <h4>Sub-agent turns</h4>
      <LogTurn v-for="c in props.turn.children" :key="c.id" :turn="c" />
    </div>
  </section>
</template>

<style scoped>
.turn { border: 1px solid #2a2a36; border-radius: 10px; padding: 1rem; margin: 0.75rem 0; background: #16161e; }
.turn-head { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; }
h4 { margin: 1rem 0 0.35rem; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.04em; color: #9a9ab0; }
.block { white-space: pre-wrap; word-break: break-word; background: #0f0f15; border: 1px solid #23232e; border-radius: 6px; padding: 0.6rem; margin: 0.3rem 0; font-size: 0.85rem; max-height: 22rem; overflow: auto; }
.events { list-style: none; padding: 0; margin: 0; }
.event { border-left: 3px solid #3a3a52; padding: 0.4rem 0 0.4rem 0.75rem; margin: 0.4rem 0; }
.event.tool { border-left-color: #4b8f6a; }
.event.err { border-left-color: #c24b4b; }
.event-head { display: flex; gap: 0.6rem; align-items: center; }
.badge { background: #25253a; border-radius: 999px; padding: 0.1rem 0.6rem; font-size: 0.75rem; }
.st-ok { background: #1f3a2b; } .st-error { background: #4a2020; } .st-recursion_limit { background: #4a3a1a; }
.muted { color: #8a8aa0; font-size: 0.8rem; }
.err-text { color: #ff9a9a; }
.children { margin-left: 1rem; border-left: 2px dashed #2f2f44; padding-left: 0.75rem; }
summary { cursor: pointer; font-size: 0.85rem; }
</style>
