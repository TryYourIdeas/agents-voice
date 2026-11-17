<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import LogTurn from '../components/LogTurn.vue'

type TurnRow = Record<string, any>

const turns = ref<TurnRow[]>([])
const total = ref(0)
const stats = ref<Record<string, any> | null>(null)
const selected = ref<Record<string, any> | null>(null)
const loading = ref(false)
const error = ref('')

const filters = ref({ q: '', agent: '', status: '', source: '', includeDelegated: false })
const limit = 25
const offset = ref(0)

const agents = computed<string[]>(() => (stats.value?.agents ?? []).map((a: any) => a.agent))
const page = computed(() => Math.floor(offset.value / limit) + 1)
const pages = computed(() => Math.max(1, Math.ceil(total.value / limit)))

const errMsg = (e: any) => e?.data?.statusMessage || e?.statusMessage || e?.message || String(e)

async function loadTurns() {
  loading.value = true
  error.value = ''
  try {
    const f = filters.value
    const res: any = await $fetch('/api/logs/turns', {
      query: {
        q: f.q || undefined, agent: f.agent || undefined, status: f.status || undefined, source: f.source || undefined,
        includeDelegated: f.includeDelegated ? '1' : undefined, limit, offset: offset.value,
      },
    })
    turns.value = res.turns
    total.value = res.total
  } catch (e) {
    error.value = errMsg(e)
    turns.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

async function loadStats() {
  try { stats.value = await $fetch('/api/logs/stats') } catch { /* surfaced by loadTurns */ }
}

function applyFilters() { offset.value = 0; loadTurns() }
function go(delta: number) { offset.value = Math.max(0, offset.value + delta * limit); loadTurns() }

async function open(id: number) {
  error.value = ''
  try { selected.value = await $fetch(`/api/logs/turns/${id}`) } catch (e) { error.value = errMsg(e) }
}

onMounted(() => { loadStats(); loadTurns() })
</script>

<template>
  <div class="logs">
    <header class="bar">
      <h1>Agent logs</h1>
      <NuxtLink to="/">← Back</NuxtLink>
      <button type="button" @click="loadStats(); loadTurns()">Refresh</button>
    </header>

    <p v-if="error" role="alert" class="error">{{ error }}</p>

    <section v-if="stats" class="stats" aria-label="Summary">
      <div class="stat"><span>Turns</span><strong>{{ stats.totals.turns }}</strong></div>
      <div class="stat"><span>Errors</span><strong>{{ stats.totals.errors ?? 0 }}</strong></div>
      <div class="stat"><span>Recursion limits</span><strong>{{ stats.totals.recursion_limits ?? 0 }}</strong></div>
      <div class="stat"><span>Avg duration</span><strong>{{ stats.totals.avg_duration_ms ?? '—' }} ms</strong></div>
      <details class="stat wide">
        <summary>Tools ({{ stats.tools.length }})</summary>
        <table>
          <thead><tr><th>Tool</th><th>Calls</th><th>Errors</th><th>Avg ms</th></tr></thead>
          <tbody><tr v-for="t in stats.tools" :key="t.name"><td>{{ t.name }}</td><td>{{ t.calls }}</td><td>{{ t.errors }}</td><td>{{ t.avg_duration_ms }}</td></tr></tbody>
        </table>
      </details>
    </section>

    <form class="filters" role="search" @submit.prevent="applyFilters">
      <label>Search <input v-model="filters.q" type="search" placeholder="text in message or reply" /></label>
      <label>Agent
        <select v-model="filters.agent"><option value="">All</option><option v-for="a in agents" :key="a" :value="a">{{ a }}</option></select>
      </label>
      <label>Status
        <select v-model="filters.status"><option value="">All</option><option>ok</option><option>error</option><option>recursion_limit</option></select>
      </label>
      <label>Source
        <select v-model="filters.source"><option value="">All</option><option>chat</option><option>scheduled</option><option>delegated</option></select>
      </label>
      <label class="check"><input v-model="filters.includeDelegated" type="checkbox" /> Include sub-agent turns</label>
      <button type="submit">Apply</button>
    </form>

    <table class="turns" aria-label="Turns">
      <thead><tr><th>#</th><th>When</th><th>Agent</th><th>Status</th><th>User message</th><th>Reply</th><th>Tools</th><th>ms</th></tr></thead>
      <tbody>
        <tr v-for="t in turns" :key="t.id" :class="{ active: selected?.id === t.id }">
          <td><button type="button" class="link" :aria-label="`Open turn ${t.id}`" @click="open(t.id)">{{ t.id }}</button></td>
          <td class="nowrap">{{ t.started_at }}</td>
          <td>{{ t.agent }}<span v-if="t.sub_agent_turns" class="muted"> +{{ t.sub_agent_turns }} sub</span></td>
          <td><span class="badge" :class="`st-${t.status}`">{{ t.status }}</span></td>
          <td class="clip">{{ t.user_message }}</td>
          <td class="clip">{{ t.final_response || t.error }}</td>
          <td>{{ t.tool_calls }}</td>
          <td>{{ t.duration_ms }}</td>
        </tr>
        <tr v-if="!turns.length && !loading"><td colspan="8" class="muted">No turns found.</td></tr>
      </tbody>
    </table>

    <nav class="pager" aria-label="Pagination">
      <button type="button" :disabled="offset === 0" @click="go(-1)">Previous</button>
      <span>Page {{ page }} of {{ pages }} · {{ total }} turns</span>
      <button type="button" :disabled="page >= pages" @click="go(1)">Next</button>
    </nav>

    <section v-if="selected" class="detail" aria-label="Turn detail">
      <button type="button" class="close" @click="selected = null">Close</button>
      <LogTurn :turn="selected" />
    </section>
  </div>
</template>

<style scoped>
.logs { max-width: 1200px; margin: 0 auto; padding: 1.5rem; color: #eaeaea; }
.bar { display: flex; gap: 1rem; align-items: center; }
.bar h1 { margin: 0; font-size: 1.4rem; flex: 1; }
a { color: #8ab4ff; }
button { background: #2a2a40; color: inherit; border: 1px solid #3a3a52; border-radius: 6px; padding: 0.35rem 0.8rem; cursor: pointer; }
button:disabled { opacity: 0.4; cursor: default; }
button.link { background: none; border: none; color: #8ab4ff; padding: 0; text-decoration: underline; }
.error { background: #4a2020; border: 1px solid #7a3030; padding: 0.6rem 0.9rem; border-radius: 6px; }
.stats { display: flex; gap: 0.75rem; flex-wrap: wrap; margin: 1rem 0; }
.stat { background: #1a1a23; border: 1px solid #2a2a36; border-radius: 8px; padding: 0.6rem 1rem; display: flex; flex-direction: column; min-width: 8rem; }
.stat span { font-size: 0.75rem; color: #9a9ab0; } .stat strong { font-size: 1.2rem; }
.stat.wide { flex: 1; min-width: 16rem; }
.filters { display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: end; margin: 1rem 0; }
.filters label { display: flex; flex-direction: column; font-size: 0.75rem; color: #9a9ab0; gap: 0.2rem; }
.filters label.check { flex-direction: row; align-items: center; color: inherit; }
input, select { background: #0f0f15; color: inherit; border: 1px solid #2a2a36; border-radius: 6px; padding: 0.35rem 0.5rem; }
table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
th, td { text-align: left; padding: 0.4rem 0.5rem; border-bottom: 1px solid #23232e; vertical-align: top; }
th { color: #9a9ab0; font-weight: 600; }
.turns tr.active { background: #1d1d2c; }
.clip { max-width: 22rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nowrap { white-space: nowrap; }
.muted { color: #8a8aa0; }
.badge { background: #25253a; border-radius: 999px; padding: 0.1rem 0.6rem; font-size: 0.75rem; }
.st-ok { background: #1f3a2b; } .st-error { background: #4a2020; } .st-recursion_limit { background: #4a3a1a; }
.pager { display: flex; gap: 1rem; align-items: center; justify-content: center; margin: 1rem 0; }
.detail { margin-top: 1rem; } .close { float: right; }
</style>
