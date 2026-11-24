<script setup lang="ts">
// Mock mailbox: one email with its headers; the body is literal text, never HTML. Reusable: props only; intended for lib/ui-lib.
defineProps<{ email?: { from: string; to: string; subject: string; date?: string | null; body: string } }>()
</script>

<template>
  <article v-if="email" aria-label="Email">
    <h4>{{ email.subject }}</h4>
    <dl>
      <dt>From</dt><dd>{{ email.from }}</dd>
      <dt>To</dt><dd>{{ email.to }}</dd>
      <template v-if="email.date"><dt>Date</dt><dd>{{ email.date }}</dd></template>
    </dl>
    <pre>{{ email.body }}</pre>
  </article>
  <p v-else class="empty">Select an email to read it.</p>
</template>

<style scoped>
h4 { margin: 0 0 0.4rem; }
dl { display: grid; grid-template-columns: max-content 1fr; gap: 0.1rem 0.75rem; margin: 0 0 0.6rem; font-size: 0.85rem; }
dt { color: #9a9ab0; } dd { margin: 0; overflow-wrap: anywhere; }
pre { margin: 0; background: #0f0f15; border: 1px solid #2a2a36; border-radius: 6px; padding: 0.6rem; white-space: pre-wrap; overflow-wrap: anywhere; }
.empty { color: #8a8aa0; }
</style>
