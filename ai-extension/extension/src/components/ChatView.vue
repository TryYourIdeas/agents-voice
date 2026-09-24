<script setup lang="ts">
import { ref } from "vue";
import { useChat } from "../composables/useChat.ts";
import { grabSelection, grabPageText } from "../composables/usePageContext.ts";
import { renderMarkdown } from "../utils/renderMarkdown.ts";

const SERVER_URL = "http://localhost:4100";

const { messages, sendMessage, pendingContext, isSending } = useChat(SERVER_URL);
const draft = ref("");
const contextError = ref<string | undefined>(undefined);

async function onSend() {
    if (!draft.value.trim() || isSending.value) return;
    const text = draft.value;
    draft.value = "";
    await sendMessage(text);
}

async function onUseSelection() {
    contextError.value = undefined;
    try {
        pendingContext.value = await grabSelection();
    } catch (error) {
        contextError.value = error instanceof Error ? error.message : String(error);
    }
}

async function onUsePage() {
    contextError.value = undefined;
    try {
        pendingContext.value = await grabPageText();
    } catch (error) {
        contextError.value = error instanceof Error ? error.message : String(error);
    }
}

function clearContext() {
    pendingContext.value = undefined;
}
</script>

<template>
  <div class="flex h-full flex-col">
    <ul class="flex-1 space-y-2 overflow-y-auto p-3" aria-live="polite">
      <li v-for="(m, i) in messages" :key="i" :class="m.role === 'user' ? 'text-right' : 'text-left'">
        <span
          v-if="m.role === 'agent'"
          class="markdown inline-block rounded bg-gray-100 px-2 py-1 text-left"
          v-html="renderMarkdown(m.text)"
        />
        <span v-else class="inline-block rounded bg-blue-100 px-2 py-1">{{ m.text }}</span>
      </li>
    </ul>

    <div v-if="pendingContext" class="mx-3 flex items-center justify-between rounded bg-yellow-100 px-2 py-1 text-sm">
      <span class="truncate">{{ pendingContext.type }}: {{ pendingContext.text }}</span>
      <button type="button" aria-label="Remove attached context" @click="clearContext">×</button>
    </div>

    <div v-if="contextError" role="alert" class="mx-3 rounded bg-red-100 px-2 py-1 text-sm text-red-800">
      {{ contextError }}
    </div>

    <div class="flex gap-2 p-3">
      <button type="button" aria-label="Use selection" @click="onUseSelection">Use selection</button>
      <button type="button" aria-label="Use page" @click="onUsePage">Use page</button>
    </div>

    <form class="flex gap-2 p-3" @submit.prevent="onSend">
      <label for="chat-message" class="sr-only">Message</label>
      <input id="chat-message" v-model="draft" type="text" aria-label="Message" class="flex-1 rounded border px-2 py-1" />
      <button type="submit" aria-label="Send">Send</button>
    </form>
  </div>
</template>

<style scoped>
.markdown :deep(p) {
  margin: 0.25em 0;
}
.markdown :deep(p:first-child) {
  margin-top: 0;
}
.markdown :deep(p:last-child) {
  margin-bottom: 0;
}
.markdown :deep(ul),
.markdown :deep(ol) {
  margin: 0.25em 0;
  padding-left: 1.25em;
}
.markdown :deep(code) {
  background: rgba(0, 0, 0, 0.08);
  border-radius: 0.2em;
  padding: 0.1em 0.3em;
  font-size: 0.9em;
}
.markdown :deep(pre) {
  background: rgba(0, 0, 0, 0.08);
  border-radius: 0.3em;
  padding: 0.5em;
  overflow-x: auto;
}
.markdown :deep(pre code) {
  background: none;
  padding: 0;
}
.markdown :deep(a) {
  color: #2563eb;
  text-decoration: underline;
}
.markdown :deep(blockquote) {
  margin: 0.25em 0;
  padding-left: 0.75em;
  border-left: 2px solid rgba(0, 0, 0, 0.2);
  color: rgba(0, 0, 0, 0.7);
}
</style>
