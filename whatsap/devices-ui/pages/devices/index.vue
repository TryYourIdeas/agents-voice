<script setup lang="ts">
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
        await navigateTo(`/devices/${created.name}`)
    } catch (err: any) {
        errorMessage.value = err?.data?.statusMessage || 'Failed to create device.'
    } finally {
        submitting.value = false
    }
}
</script>

<template>
  <main style="max-width: 480px; margin: 2rem auto; font-family: system-ui, sans-serif;">
    <h1>WhatsApp Devices</h1>
    <ul>
      <li v-for="device in devices" :key="device.name">
        <NuxtLink :to="`/devices/${device.name}`">
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
    <p v-if="errorMessage" style="color: red">{{ errorMessage }}</p>
  </main>
</template>
