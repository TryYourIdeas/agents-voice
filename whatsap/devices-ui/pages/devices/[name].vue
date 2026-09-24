<script setup lang="ts">
interface Device {
    name: string
    label: string
    status: string
}

const route = useRoute()
const deviceName = route.params.name as string

const device = ref<Device | undefined>()
// Bumped only on mount and on an explicit "Refresh QR code" click — never
// on a timer. An earlier version re-fetched the image on every status poll
// tick, which forced the browser to reload it every couple of seconds even
// when the underlying QR hadn't actually changed, making it flicker too
// fast to scan. Status polling below stays lightweight (JSON only) so the
// page still notices a successful connection on its own.
const qrCacheBuster = ref(0)
let statusTimer: ReturnType<typeof setInterval> | undefined

async function pollStatus() {
    const devices = await $fetch<Device[]>('/api/devices')
    device.value = devices.find((d) => d.name === deviceName)
}

function refreshQr() {
    qrCacheBuster.value++
}

const reconnecting = ref(false)
const reconnectError = ref('')

async function reconnect() {
    reconnectError.value = ''
    reconnecting.value = true
    try {
        await $fetch(`/api/devices/${deviceName}/reconnect`, { method: 'POST' })
        // The 2s status poll below picks up whatever this settles into
        // (straight back to 'connected' if the session was still valid,
        // or 'pending' with a fresh QR otherwise) — no need to poll here.
    } catch (err: any) {
        reconnectError.value = err?.data?.statusMessage || 'Failed to reconnect.'
    } finally {
        reconnecting.value = false
    }
}

onMounted(() => {
    pollStatus()
    refreshQr()
    statusTimer = setInterval(pollStatus, 2000)
})
onUnmounted(() => {
    if (statusTimer) clearInterval(statusTimer)
})
</script>

<template>
  <main style="max-width: 480px; margin: 2rem auto; font-family: system-ui, sans-serif; text-align: center;">
    <p style="text-align: left"><NuxtLink to="/devices">&larr; All devices</NuxtLink></p>
    <h1>{{ device?.label || deviceName }}</h1>

    <p v-if="!device">Setting up...</p>
    <p v-else-if="device.status === 'connected'">✅ Connected</p>
    <div v-else-if="device.status === 'pending'">
      <p>Scan this QR code with WhatsApp:</p>
      <img :src="`/api/devices/${deviceName}/qr.png?t=${qrCacheBuster}`" alt="QR code" width="300" height="300" />
      <p>
        <button type="button" @click="refreshQr">Refresh QR code</button>
      </p>
      <p style="color: #666; font-size: 0.9em">
        WhatsApp QR codes expire after about a minute — click refresh if scanning fails.
      </p>
    </div>
    <div v-else-if="device.status === 'disconnected'">
      <p>❌ Disconnected</p>
      <p>
        <button type="button" @click="reconnect" :disabled="reconnecting">
          {{ reconnecting ? 'Reconnecting…' : 'Reconnect' }}
        </button>
      </p>
      <p v-if="reconnectError" style="color: red">{{ reconnectError }}</p>
    </div>
    <p v-else>Status: {{ device.status }}</p>
  </main>
</template>
