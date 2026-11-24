<script setup lang="ts">
// Mock file system: contents of one file, shown as literal text. Reusable: props only; intended for lib/ui-lib.
defineProps<{ file?: { path: string; content: string } }>()
</script>

<template>
  <section v-if="file" aria-label="File contents">
    <h4>{{ file.path }}</h4>
    <pre>{{ file.content }}</pre>
  </section>
  <p v-else class="empty">Select a file to see its contents.</p>
</template>

<style scoped>
h4 { margin: 0 0 0.4rem; font-family: ui-monospace, monospace; font-size: 0.85rem; }
pre { margin: 0; background: #0f0f15; border: 1px solid #2a2a36; border-radius: 6px; padding: 0.6rem; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 24rem; overflow: auto; }
.empty { color: #8a8aa0; }
</style>
