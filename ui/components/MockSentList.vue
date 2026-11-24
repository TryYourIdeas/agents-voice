<script setup lang="ts">
// Mock mailbox (sent): one row per email. Reusable: props/emits only; intended for lib/ui-lib.
defineProps<{ emails: { uid: number; from: string; to: string; subject: string }[]; selectedUid?: number }>()
defineEmits<{ select: [uid: number] }>()
</script>

<template>
  <ul v-if="emails.length" aria-label="Sent emails">
    <li v-for="m in emails" :key="m.uid">
      <button type="button" :aria-current="m.uid === selectedUid ? 'true' : undefined" :class="{ on: m.uid === selectedUid }" @click="$emit('select', m.uid)">
        <strong>{{ m.subject }}</strong>
        <span>{{ m.to }}</span>
      </button>
    </li>
  </ul>
  <p v-else class="empty">Nothing sent yet.</p>
</template>

<style scoped>
ul { list-style: none; margin: 0; padding: 0; }
button { width: 100%; text-align: left; background: none; border: none; color: #eaeaea; padding: 0.4rem 0.5rem; border-radius: 6px; cursor: pointer; display: flex; flex-direction: column; }
button:hover, button.on { background: #25253a; }
span { font-size: 0.75rem; color: #9a9ab0; }
.empty { color: #8a8aa0; }
</style>
