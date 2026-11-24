<script setup lang="ts">
// Landing page: links to the app's three tools. App-specific (fixed route list).
const links = [
  { to: '/tts', title: 'Text to speech & transcription', text: 'Type text and hear it spoken, clone voices, or transcribe audio with Whisper or Qwen.' },
  { to: '/connect', title: 'Connect devices', text: 'Add WhatsApp devices, scan QR codes to pair them, and reconnect disconnected ones.' },
  { to: '/models', title: 'Model configurations', text: 'Configure the reasoning models (name, base URL, API key) that logged turns can be replayed with.' },
  { to: '/logs', title: 'Agent logs', text: 'Review user messages, agent and sub-agent replies and tool results recorded by the bot.' },
]
</script>

<template>
  <div class="home">
    <main>
      <h1>Agents Voice</h1>
      <p class="subtitle">Pick a tool.</p>
      <nav aria-label="Tools">
        <ul>
          <li v-for="l in links" :key="l.to">
            <NuxtLink :to="l.to" class="tool">
              <strong>{{ l.title }}</strong>
              <span>{{ l.text }}</span>
            </NuxtLink>
          </li>
        </ul>
      </nav>
    </main>
  </div>
</template>

<style scoped>
.home { min-height: 100%; display: grid; place-items: center; padding: 2rem; color: #eaeaea; }
main { width: 100%; max-width: 640px; }
h1 { margin: 0 0 0.25rem; font-size: 1.8rem; }
.subtitle { margin: 0 0 1.5rem; color: #9a9ab0; }
ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.9rem; }
.tool { display: flex; flex-direction: column; gap: 0.3rem; padding: 1.1rem 1.25rem; background: #1a1a23; border: 1px solid #2a2a36; border-radius: 12px; color: inherit; text-decoration: none; }
.tool strong { color: #8ab4ff; font-size: 1.05rem; }
.tool span { color: #b8b8c8; font-size: 0.9rem; }
.tool:hover, .tool:focus-visible { border-color: #4a6fb5; background: #1e1e2a; outline: none; }
</style>
