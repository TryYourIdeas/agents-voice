<script setup lang="ts">
// Mock chat transcript. Reusable: props only (messages), no app state; intended for lib/ui-lib.
defineProps<{ messages: { kind: string; text: string; ts?: string }[] }>()
const label = (k: string) => (k === 'audio' ? 'Voice note' : 'Agent reply')
</script>

<template>
  <div class="mock-chat">
    <ol v-if="messages.length" aria-label="Chat">
      <li v-for="(m, i) in messages" :key="i" :class="m.kind">
        <span class="who">{{ label(m.kind) }}</span>
        <p>{{ m.text }}</p>
      </li>
    </ol>
    <p v-else class="empty">No messages yet.</p>
  </div>
</template>

<style scoped>
ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
li { align-self: flex-start; max-width: 90%; background: #1f3a2b; border-radius: 10px; padding: 0.5rem 0.75rem; }
li.audio { background: #2a2a4a; }
.who { font-size: 0.7rem; color: #9a9ab0; }
p { margin: 0.15rem 0 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.empty { color: #8a8aa0; }
</style>
