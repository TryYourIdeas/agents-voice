<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import MockChat from '../../components/MockChat.vue'
import MockFileList from '../../components/MockFileList.vue'
import MockFileView from '../../components/MockFileView.vue'
import MockInboxList from '../../components/MockInboxList.vue'
import MockSentList from '../../components/MockSentList.vue'
import MockEmailView from '../../components/MockEmailView.vue'

interface Config { id: number; name: string; model: string }
interface Email { uid: number; from: string; to: string; subject: string; date?: string | null; body: string }

const POLL_MS = 1500
const MAX_POLL_MS = 10 * 60_000

const route = useRoute()
const turnId = Number(route.params.turnId)

const original = ref<Record<string, any> | null>(null)
const configs = ref<Config[]>([])
const configId = ref('')
const error = ref('')
const starting = ref(false)
const replay = ref<Record<string, any> | null>(null)
const sandbox = ref<{ files: { path: string; content: string }[]; inbox: Email[]; sent: Email[]; messages: any[] }>({ files: [], inbox: [], sent: [], messages: [] })
const selectedFile = ref<string | undefined>()
const selectedMail = ref<{ folder: 'inbox' | 'sent'; uid: number } | undefined>()
const timedOut = ref(false)

let timer: ReturnType<typeof setTimeout> | undefined
let stopped = false

const errMsg = (e: any) => e?.data?.error || e?.data?.statusMessage || e?.statusMessage || e?.message || String(e)
const fileObj = computed(() => sandbox.value.files.find((f) => f.path === selectedFile.value))
const emailObj = computed(() => {
  const m = selectedMail.value
  return m ? sandbox.value[m.folder].find((e) => e.uid === m.uid) : undefined
})
const running = computed(() => replay.value?.status === 'running')

async function refresh(id: number) {
  const [t, s] = await Promise.all([$fetch<Record<string, any>>(`/api/logs/turns/${id}`), $fetch<any>(`/api/logs/turns/${id}/sandbox`)])
  replay.value = t
  sandbox.value = s
  return t
}

async function poll(id: number, startedAt: number) {
  if (stopped) return
  try {
    const t = await refresh(id)
    if (t.status !== 'running') return
  } catch (e) {
    error.value = errMsg(e)
    return
  }
  if (Date.now() - startedAt > MAX_POLL_MS) { timedOut.value = true; return }
  timer = setTimeout(() => poll(id, startedAt), POLL_MS)
}

async function run() {
  error.value = ''
  timedOut.value = false
  replay.value = null
  sandbox.value = { files: [], inbox: [], sent: [], messages: [] }
  selectedFile.value = undefined
  selectedMail.value = undefined
  starting.value = true
  try {
    const r = await $fetch<{ replayTurnId: number }>('/api/replay', { method: 'POST', body: { turnId, modelConfigId: Number(configId.value) } })
    await poll(r.replayTurnId, Date.now())
  } catch (e) {
    error.value = errMsg(e)
  } finally {
    starting.value = false
  }
}

onMounted(async () => {
  try {
    ;[original.value, configs.value] = await Promise.all([$fetch<Record<string, any>>(`/api/logs/turns/${turnId}`), $fetch<Config[]>('/api/model-configs')])
  } catch (e) {
    error.value = errMsg(e)
  }
})
onUnmounted(() => { stopped = true; if (timer) clearTimeout(timer) })
</script>

<template>
  <div class="replay">
    <header class="bar">
      <h1>Replay turn #{{ turnId }}</h1>
      <NuxtLink to="/logs">← Agent logs</NuxtLink>
      <NuxtLink to="/models">Model configurations</NuxtLink>
    </header>

    <p v-if="error" role="alert" class="error">{{ error }}</p>

    <section v-if="original" aria-label="Original turn">
      <h2>Original message</h2>
      <pre class="block">{{ original.user_message }}</pre>
      <p class="muted">Agent {{ original.agent }}<template v-if="original.reasoning_model"> · model {{ original.reasoning_model }}</template>. The replay runs in a sandbox: nothing is sent, written or run for real.</p>
    </section>

    <form class="run" @submit.prevent="run">
      <label>Model configuration
        <select v-model="configId">
          <option value="" disabled>Choose a model…</option>
          <option v-for="c in configs" :key="c.id" :value="String(c.id)">{{ c.name }} ({{ c.model }})</option>
        </select>
      </label>
      <button type="submit" :disabled="!configId || starting || running">Run replay</button>
      <NuxtLink v-if="!configs.length" to="/models">Add a model configuration</NuxtLink>
    </form>

    <section v-if="replay" aria-label="Replay result">
      <h2>Result
        <span class="badge" :class="`st-${replay.status}`">{{ replay.status }}</span>
        <span v-if="replay.reasoning_model" class="muted"> model {{ replay.reasoning_model }}</span>
        <span v-if="replay.tokens" class="muted"> · tokens in {{ replay.tokens.input_tokens }} / out {{ replay.tokens.output_tokens }}</span>
        <NuxtLink :to="`/logs`" class="muted"> · turn #{{ replay.id }} in the logs</NuxtLink>
      </h2>
      <p v-if="running" class="muted">Running… this page updates by itself.</p>
      <p v-if="timedOut" role="alert" class="error">Stopped waiting after 10 minutes; check the logs for turn #{{ replay.id }}.</p>
      <pre v-if="replay.error" role="alert" class="block err">{{ replay.error }}</pre>

      <div class="sandbox">
        <section aria-label="Messages"><h3>Messages</h3><MockChat :messages="sandbox.messages" /></section>
        <section aria-label="File system">
          <h3>Files</h3>
          <div class="pair">
            <MockFileList :files="sandbox.files" :selected="selectedFile" @select="selectedFile = $event" />
            <MockFileView :file="fileObj" />
          </div>
        </section>
        <section aria-label="Mailbox">
          <h3>Mail</h3>
          <div class="mail">
            <div><h4>Inbox</h4><MockInboxList :emails="sandbox.inbox" :selected-uid="selectedMail?.folder === 'inbox' ? selectedMail.uid : undefined" @select="selectedMail = { folder: 'inbox', uid: $event }" /></div>
            <div><h4>Sent</h4><MockSentList :emails="sandbox.sent" :selected-uid="selectedMail?.folder === 'sent' ? selectedMail.uid : undefined" @select="selectedMail = { folder: 'sent', uid: $event }" /></div>
            <MockEmailView :email="emailObj" />
          </div>
        </section>
      </div>
    </section>
  </div>
</template>

<style scoped>
.replay { max-width: 1200px; margin: 0 auto; padding: 1.5rem; color: #eaeaea; }
.bar { display: flex; gap: 1rem; align-items: center; flex-wrap: wrap; }
.bar h1 { margin: 0; font-size: 1.4rem; flex: 1; }
a { color: #8ab4ff; }
h2 { font-size: 1.05rem; } h3 { font-size: 0.95rem; margin: 0 0 0.5rem; } h4 { margin: 0 0 0.3rem; font-size: 0.8rem; color: #9a9ab0; }
button { background: #2a2a40; color: inherit; border: 1px solid #3a3a52; border-radius: 6px; padding: 0.4rem 0.9rem; cursor: pointer; }
button:disabled { opacity: 0.4; cursor: default; }
select { background: #0f0f15; color: inherit; border: 1px solid #2a2a36; border-radius: 6px; padding: 0.4rem 0.5rem; }
.run { display: flex; gap: 0.75rem; align-items: end; flex-wrap: wrap; margin: 1rem 0; }
.run label { display: flex; flex-direction: column; font-size: 0.8rem; color: #9a9ab0; gap: 0.25rem; }
.error { background: #4a2020; border: 1px solid #7a3030; padding: 0.6rem 0.9rem; border-radius: 6px; }
.block { background: #0f0f15; border: 1px solid #2a2a36; border-radius: 6px; padding: 0.6rem; white-space: pre-wrap; overflow-wrap: anywhere; }
.err { border-color: #7a3030; }
.muted { color: #8a8aa0; font-weight: normal; font-size: 0.85rem; }
.badge { background: #25253a; border-radius: 999px; padding: 0.1rem 0.6rem; font-size: 0.75rem; }
.st-ok { background: #1f3a2b; } .st-error { background: #4a2020; } .st-recursion_limit { background: #4a3a1a; }
.sandbox { display: grid; gap: 1rem; grid-template-columns: 1fr; }
.sandbox > section { background: #1a1a23; border: 1px solid #2a2a36; border-radius: 8px; padding: 0.8rem; min-width: 0; }
.pair { display: grid; gap: 0.75rem; grid-template-columns: minmax(10rem, 1fr) 2fr; }
.mail { display: grid; gap: 0.75rem; grid-template-columns: 1fr 1fr; }
.mail > :last-child { grid-column: 1 / -1; }
@media (max-width: 640px) { .pair, .mail { grid-template-columns: 1fr; } }
</style>
