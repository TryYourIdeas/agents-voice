<script setup lang="ts">
// Mock file system: list of file paths. Reusable: props/emits only; intended for lib/ui-lib.
defineProps<{ files: { path: string }[]; selected?: string }>()
defineEmits<{ select: [path: string] }>()
</script>

<template>
  <ul v-if="files.length" aria-label="Files">
    <li v-for="f in files" :key="f.path">
      <button type="button" :aria-current="f.path === selected ? 'true' : undefined" :class="{ on: f.path === selected }" @click="$emit('select', f.path)">{{ f.path }}</button>
    </li>
  </ul>
  <p v-else class="empty">No files.</p>
</template>

<style scoped>
ul { list-style: none; margin: 0; padding: 0; }
button { width: 100%; text-align: left; background: none; border: none; color: #eaeaea; padding: 0.3rem 0.5rem; border-radius: 6px; cursor: pointer; font-family: ui-monospace, monospace; font-size: 0.85rem; }
button:hover, button.on { background: #25253a; }
.empty { color: #8a8aa0; }
</style>
