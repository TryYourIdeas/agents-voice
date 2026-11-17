<script setup lang="ts">
import { ref } from 'vue'
interface Device {
    name: string
    label: string
    status: string
}

const { data: devices, refresh } = await useFetch<Device[]>('/api/devices')

const newName = ref('')
const newLabel = ref('')
const submitting = ref(false)
const errorMessage = ref('')

async function addDevice() {
    errorMessage.value = ''
    submitting.value = true
    try {
        const created = await $fetch<{ name: string }>('/api/new-device', {
            method: 'POST',
            body: { name: newName.value, label: newLabel.value },
        })
        await navigateTo(`/connect/${created.name}`)
    } catch (err: any) {
        errorMessage.value = err?.data?.statusMessage || 'Failed to create device.'
    } finally {
        submitting.value = false
    }
}
</script>

<template>
  <main style="max-width: 480px; margin: 2rem auto; padding: 0 1rem; color: #eaeaea;">
    <p><NuxtLink to="/">← Home</NuxtLink> · <NuxtLink to="/logs">Agent logs</NuxtLink></p>
    <h1>Connect WhatsApp devices</h1>
    <ul>
      <li v-for="device in devices" :key="device.name">
        <NuxtLink :to="`/connect/${device.name}`">
          {{ device.label }} ({{ device.name }}) — {{ device.status }}
        </NuxtLink>
      </li>
    </ul>
    <p v-if="!devices?.length">No devices yet.</p>

    <h2>Add Device</h2>
    <form @submit.prevent="addDevice">
      <div>
        <label>
          Name (lowercase letters, numbers, dashes only)
          <input v-model="newName" required pattern="[a-z0-9][a-z0-9-]*" />
        </label>
      </div>
      <div>
        <label>
          Label
          <input v-model="newLabel" />
        </label>
      </div>
      <button type="submit" :disabled="submitting">Add Device</button>
    </form>
    <p v-if="errorMessage" style="color: #ff9a9a" role="alert">{{ errorMessage }}</p>
  </main>
</template>
