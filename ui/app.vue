<template>
  <div class="page">
    <main class="card">
      <h1>Qwen3 TTS</h1>
      <p class="subtitle">Type something, pick a voice, hear it spoken.</p>

      <form @submit.prevent="synthesize">
        <label class="field">
          <span>Text</span>
          <textarea
            v-model="text"
            rows="5"
            maxlength="4000"
            required
            placeholder="Enter the text to synthesize…"
          />
        </label>

        <div class="row">
          <label class="field">
            <span>Speaker</span>
            <select v-model="speaker">
              <optgroup label="Presets">
                <option v-for="s in voices.speakers" :key="s" :value="s">{{ s }}</option>
              </optgroup>
              <optgroup v-if="voices.cloned.length" label="Cloned">
                <option v-for="s in voices.cloned" :key="s" :value="s">{{ s }}</option>
              </optgroup>
            </select>
          </label>

          <label class="field">
            <span>Language</span>
            <select v-model="language">
              <option v-for="l in voices.languages" :key="l" :value="l">{{ l }}</option>
            </select>
          </label>
        </div>

        <label class="field">
          <span>Instruction (optional)</span>
          <input
            v-model="instruct"
            type="text"
            placeholder="e.g. Very happy."
          />
        </label>

        <button type="submit" :disabled="loading || !text.trim()">
          {{ loading ? 'Synthesizing…' : 'Synthesize' }}
        </button>
      </form>

      <p v-if="error" class="error">{{ error }}</p>

      <audio
        v-if="audioUrl"
        :src="audioUrl"
        controls
        autoplay
        class="player"
      />

      <details class="section" :open="transcribeOpen">
        <summary @click="transcribeOpen = !transcribeOpen">Transcribe speech</summary>
        <form class="section-form" @submit.prevent="transcribe">
          <p class="hint">Record or upload audio to convert speech to text.</p>

          <label class="field">
            <span>Audio</span>
            <div class="record-row">
              <input type="file" accept="audio/*" @change="onSttFileChange" />
              <button
                type="button"
                class="secondary"
                :disabled="transcribing"
                @click="toggleSttRecord"
              >
                {{ sttRecording ? 'Stop' : 'Record' }}
              </button>
            </div>
            <p v-if="sttAudioInfo" class="hint">{{ sttAudioInfo }}</p>
          </label>

          <div class="row">
            <label class="field">
              <span>Engine</span>
              <select v-model="sttEngine">
                <option value="whisper">Whisper</option>
                <option value="qwen">Qwen</option>
              </select>
            </label>
            <label class="field">
              <span>Language</span>
              <select v-model="sttLanguage">
                <option value="">Auto-detect</option>
                <option v-for="l in sttLanguages" :key="l.code" :value="l.code">{{ l.name }}</option>
              </select>
            </label>
          </div>
          <label class="field">
            <span>Task</span>
            <select v-model="sttTask" :disabled="sttEngine === 'qwen'">
              <option value="transcribe">Transcribe</option>
              <option value="translate">Translate to English</option>
            </select>
          </label>

          <button type="submit" :disabled="transcribing || !sttAudio">
            {{ transcribing ? 'Transcribing…' : 'Transcribe' }}
          </button>

          <p v-if="sttError" class="error">{{ sttError }}</p>

          <div v-if="transcript">
            <label class="field">
              <span>Transcript</span>
              <textarea v-model="transcript" rows="3" />
            </label>
            <button type="button" class="secondary" @click="useTranscriptAsInput">
              Use as synthesis input
            </button>
          </div>
        </form>
      </details>

      <details class="section" :open="cloneOpen">
        <summary @click="cloneOpen = !cloneOpen">Clone a new voice</summary>
        <form class="section-form" @submit.prevent="cloneVoice">
          <p class="hint">
            Provide ~3–10 seconds of clean speech and the exact transcript.
            The cloned voice becomes selectable above.
          </p>

          <label class="field">
            <span>Reference audio</span>
            <div class="record-row">
              <input type="file" accept="audio/*" @change="onFileChange" />
              <button
                type="button"
                class="secondary"
                :disabled="cloning"
                @click="toggleRecord"
              >
                {{ recording ? 'Stop' : 'Record' }}
              </button>
            </div>
            <p v-if="audioInfo" class="hint">{{ audioInfo }}</p>
          </label>

          <label class="field">
            <span>Reference transcript</span>
            <textarea
              v-model="refText"
              rows="2"
              required
              placeholder="What is being said in the reference audio…"
            />
          </label>

          <label class="field">
            <span>Voice ID (optional)</span>
            <input
              v-model="cloneId"
              type="text"
              placeholder="auto-generated if blank — e.g. my-voice"
              pattern="[A-Za-z0-9_-]*"
            />
          </label>

          <button
            type="submit"
            :disabled="cloning || !cloneAudio || !refText.trim()"
          >
            {{ cloning ? 'Cloning…' : 'Clone voice' }}
          </button>

          <p v-if="cloneMessage" :class="cloneError ? 'error' : 'success'">
            {{ cloneMessage }}
          </p>
        </form>
      </details>
    </main>
  </div>
</template>

<script setup lang="ts">
type VoiceList = {
  speakers: string[]
  cloned: string[]
  languages: string[]
  clone_enabled?: boolean
}

const text = ref('')
const speaker = ref('Ryan')
const language = ref('Auto')
const instruct = ref('')
const loading = ref(false)
const error = ref('')
const audioUrl = ref<string | null>(null)

const voices = ref<VoiceList>({
  speakers: ['Vivian', 'Serena', 'Uncle_Fu', 'Dylan', 'Eric', 'Ryan', 'Aiden', 'Ono_Anna', 'Sohee'],
  cloned: [],
  languages: ['Auto', 'Chinese', 'English', 'Japanese', 'Korean', 'German', 'French', 'Russian', 'Portuguese', 'Spanish', 'Italian'],
  clone_enabled: true,
})

const cloneOpen = ref(false)
const cloneAudio = ref<Blob | null>(null)
const audioInfo = ref('')
const refText = ref('')
const cloneId = ref('')
const cloning = ref(false)
const cloneMessage = ref('')
const cloneError = ref(false)

const recording = ref(false)
let mediaRecorder: MediaRecorder | null = null
let recChunks: Blob[] = []

const transcribeOpen = ref(false)
const sttAudio = ref<Blob | null>(null)
const sttAudioInfo = ref('')
const sttEngine = ref<'whisper' | 'qwen'>('whisper')
const sttLanguage = ref('')
const sttTask = ref<'transcribe' | 'translate'>('transcribe')

watch(sttEngine, (engine) => {
  // Qwen3-ASR has no translate mode.
  if (engine === 'qwen') sttTask.value = 'transcribe'
})
const transcribing = ref(false)
const transcript = ref('')
const sttError = ref('')
const sttRecording = ref(false)
let sttRecorder: MediaRecorder | null = null
let sttChunks: Blob[] = []

const sttLanguages = [
  { code: 'english', name: 'English' },
  { code: 'spanish', name: 'Spanish' },
  { code: 'chinese', name: 'Chinese' },
  { code: 'japanese', name: 'Japanese' },
  { code: 'korean', name: 'Korean' },
  { code: 'french', name: 'French' },
  { code: 'german', name: 'German' },
  { code: 'italian', name: 'Italian' },
  { code: 'portuguese', name: 'Portuguese' },
  { code: 'russian', name: 'Russian' },
]

function onSttFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  sttAudio.value = file
  sttAudioInfo.value = `Selected: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`
}

async function toggleSttRecord() {
  if (sttRecording.value) {
    sttRecorder?.stop()
    return
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    sttChunks = []
    sttRecorder = new MediaRecorder(stream)
    sttRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) sttChunks.push(e.data)
    }
    sttRecorder.onstop = () => {
      const mime = sttRecorder?.mimeType || 'audio/webm'
      const blob = new Blob(sttChunks, { type: mime })
      sttAudio.value = blob
      sttAudioInfo.value = `Recorded: ${(blob.size / 1024).toFixed(1)} KB (${mime})`
      stream.getTracks().forEach((t) => t.stop())
      sttRecording.value = false
    }
    sttRecorder.start()
    sttRecording.value = true
  } catch {
    sttError.value = 'Microphone access denied or unavailable'
  }
}

async function transcribe() {
  if (!sttAudio.value) return
  transcribing.value = true
  sttError.value = ''
  try {
    const fd = new FormData()
    const ext = (sttAudio.value.type.split('/')[1] || 'webm').split(';')[0]
    fd.append('audio', sttAudio.value, `speech.${ext}`)
    if (sttLanguage.value) fd.append('language', sttLanguage.value)
    fd.append('task', sttTask.value)
    const result = await $fetch<{ text: string }>('/api/stt', {
      method: 'POST',
      query: { engine: sttEngine.value },
      body: fd,
    })
    transcript.value = result.text
  } catch (e: unknown) {
    const err = e as { statusMessage?: string; message?: string }
    sttError.value = err.statusMessage || err.message || 'Transcription failed'
  } finally {
    transcribing.value = false
  }
}

function useTranscriptAsInput() {
  text.value = transcript.value
}

async function refreshVoices() {
  try {
    voices.value = await $fetch<VoiceList>('/api/voices')
  } catch {
    /* keep static fallback */
  }
}
onMounted(refreshVoices)

async function synthesize() {
  loading.value = true
  error.value = ''
  if (audioUrl.value) {
    URL.revokeObjectURL(audioUrl.value)
    audioUrl.value = null
  }
  try {
    const blob = await $fetch<Blob>('/api/tts', {
      method: 'POST',
      body: {
        text: text.value,
        speaker: speaker.value,
        language: language.value,
        instruct: instruct.value,
      },
      responseType: 'blob',
    })
    audioUrl.value = URL.createObjectURL(blob)
  } catch (e: unknown) {
    const err = e as { statusMessage?: string; message?: string }
    error.value = err.statusMessage || err.message || 'Failed to synthesize'
  } finally {
    loading.value = false
  }
}

function onFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  cloneAudio.value = file
  audioInfo.value = `Selected: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`
}

async function toggleRecord() {
  if (recording.value) {
    mediaRecorder?.stop()
    return
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    recChunks = []
    mediaRecorder = new MediaRecorder(stream)
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recChunks.push(e.data)
    }
    mediaRecorder.onstop = () => {
      const mime = mediaRecorder?.mimeType || 'audio/webm'
      const blob = new Blob(recChunks, { type: mime })
      cloneAudio.value = blob
      audioInfo.value = `Recorded: ${(blob.size / 1024).toFixed(1)} KB (${mime})`
      stream.getTracks().forEach((t) => t.stop())
      recording.value = false
    }
    mediaRecorder.start()
    recording.value = true
  } catch {
    cloneError.value = true
    cloneMessage.value = 'Microphone access denied or unavailable'
  }
}

async function cloneVoice() {
  if (!cloneAudio.value) return
  cloning.value = true
  cloneMessage.value = ''
  cloneError.value = false
  try {
    const fd = new FormData()
    const ext = (cloneAudio.value.type.split('/')[1] || 'webm').split(';')[0]
    fd.append('audio', cloneAudio.value, `ref.${ext}`)
    fd.append('ref_text', refText.value)
    if (cloneId.value.trim()) fd.append('voice_id', cloneId.value.trim())

    const result = await $fetch<{ voice_id: string }>('/api/voices/clone', {
      method: 'POST',
      body: fd,
    })
    cloneMessage.value = `Cloned as "${result.voice_id}". Selected as the active speaker.`
    await refreshVoices()
    speaker.value = result.voice_id
    cloneAudio.value = null
    audioInfo.value = ''
    refText.value = ''
    cloneId.value = ''
  } catch (e: unknown) {
    cloneError.value = true
    const err = e as { statusMessage?: string; message?: string }
    cloneMessage.value = err.statusMessage || err.message || 'Clone failed'
  } finally {
    cloning.value = false
  }
}

onBeforeUnmount(() => {
  if (audioUrl.value) URL.revokeObjectURL(audioUrl.value)
  if (recording.value) mediaRecorder?.stop()
  if (sttRecording.value) sttRecorder?.stop()
})
</script>

<style>
* { box-sizing: border-box; }
html, body, #__nuxt { height: 100%; margin: 0; }
body {
  font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  background: linear-gradient(180deg, #0d0d12 0%, #14141c 100%);
  color: #eaeaea;
}
.page {
  min-height: 100%;
  display: grid;
  place-items: center;
  padding: 2rem;
}
.card {
  width: 100%;
  max-width: 640px;
  padding: 2.25rem;
  background: #1a1a23;
  border: 1px solid #2a2a36;
  border-radius: 14px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
}
h1 { margin: 0 0 0.25rem; font-size: 1.75rem; }
.subtitle { margin: 0 0 1.75rem; color: #9aa0aa; font-size: 0.95rem; }
form { display: grid; gap: 1.1rem; }
.field { display: grid; gap: 0.4rem; font-size: 0.85rem; color: #9aa0aa; }
.field span { font-weight: 500; letter-spacing: 0.02em; }
.row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
textarea, input, select {
  padding: 0.65rem 0.75rem;
  border-radius: 8px;
  border: 1px solid #2f2f3d;
  background: #0f0f17;
  color: #eaeaea;
  font: inherit;
  width: 100%;
}
textarea { resize: vertical; min-height: 6rem; }
textarea:focus, input:focus, select:focus {
  outline: none;
  border-color: #6366f1;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.18);
}
button {
  margin-top: 0.25rem;
  padding: 0.8rem 1rem;
  border-radius: 8px;
  border: 0;
  background: #6366f1;
  color: #fff;
  font-weight: 600;
  font-size: 1rem;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.05s ease;
}
button:hover:not(:disabled) { background: #7c7ff5; }
button:active:not(:disabled) { transform: translateY(1px); }
button:disabled { opacity: 0.55; cursor: not-allowed; }
button.secondary {
  background: #2a2a36;
  color: #eaeaea;
  border: 1px solid #3a3a4a;
}
button.secondary:hover:not(:disabled) { background: #34344a; }
.error {
  margin: 1rem 0 0;
  padding: 0.7rem 0.85rem;
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.4);
  border-radius: 8px;
  color: #fca5a5;
  font-size: 0.9rem;
}
.success {
  margin: 0.5rem 0 0;
  padding: 0.7rem 0.85rem;
  background: rgba(34, 197, 94, 0.10);
  border: 1px solid rgba(34, 197, 94, 0.35);
  border-radius: 8px;
  color: #86efac;
  font-size: 0.9rem;
}
.player { width: 100%; margin-top: 1.5rem; }
.section {
  margin-top: 2rem;
  border-top: 1px solid #2a2a36;
  padding-top: 1.25rem;
}
.section summary {
  cursor: pointer;
  font-weight: 600;
  color: #c7c9d1;
  list-style: none;
  user-select: none;
}
.section summary::before {
  content: '▸ ';
  display: inline-block;
  transition: transform 0.15s ease;
}
.section[open] summary::before { content: '▾ '; }
.section-form { margin-top: 1rem; }
.record-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.5rem;
  align-items: center;
}
.hint { margin: 0; color: #7a818d; font-size: 0.8rem; }
</style>
