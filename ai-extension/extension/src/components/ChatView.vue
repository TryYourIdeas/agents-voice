<script setup lang="ts">
import { ref } from "vue";
import { useChat } from "../composables/useChat.ts";
import { grabSelection, grabPageText } from "../composables/usePageContext.ts";

const SERVER_URL = "http://localhost:4100";

const { messages, sendMessage, pendingContext, isSending } = useChat(SERVER_URL);
const draft = ref("");

async function onSend() {
    if (!draft.value.trim() || isSending.value) return;
    const text = draft.value;
    draft.value = "";
    await sendMessage(text);
}

async function onUseSelection() {
    pendingContext.value = await grabSelection();
}

async function onUsePage() {
    pendingContext.value = await grabPageText();
}

function clearContext() {
    pendingContext.value = undefined;
}
</script>

<template>
  <div class="flex h-full flex-col">
    <ul class="flex-1 space-y-2 overflow-y-auto p-3" aria-live="polite">
      <li v-for="(m, i) in messages" :key="i" :class="m.role === 'user' ? 'text-right' : 'text-left'">
        <span class="inline-block rounded px-2 py-1" :class="m.role === 'user' ? 'bg-blue-100' : 'bg-gray-100'">
          {{ m.text }}
        </span>
      </li>
    </ul>

    <div v-if="pendingContext" class="mx-3 flex items-center justify-between rounded bg-yellow-100 px-2 py-1 text-sm">
      <span class="truncate">{{ pendingContext.type }}: {{ pendingContext.text }}</span>
      <button type="button" aria-label="Remove attached context" @click="clearContext">×</button>
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
