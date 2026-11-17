import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/vue'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import userEvent from '@testing-library/user-event'
import { ref, h, defineComponent, Suspense } from 'vue'

vi.mock('vue-router', () => ({ useRoute: () => ({ params: { name: 'luis-cel' } }) }))
import Index from '../pages/connect/index.vue'
import Device from '../pages/connect/[name].vue'

// the index page awaits useFetch at setup, so it needs a Suspense boundary
const Async = defineComponent({ render: () => h(Suspense, null, { default: () => h(Index), fallback: () => h('p', 'loading') }) })
let mounted: VueWrapper | undefined
// Testing Library's render() does not mount a Suspense root, so mount directly and query via screen.
async function renderIndex() {
  mounted = mount(Async, { attachTo: document.body, global: { stubs } })
  await flushPromises()
}
const stubs = { NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } }
let navigateTo: ReturnType<typeof vi.fn>
let fetchMock: ReturnType<typeof vi.fn>
let devices: any[]

beforeEach(() => {
  devices = [{ name: 'primary', label: 'Primary', status: 'connected' }, { name: 'luis-cel', label: 'Luis', status: 'pending' }]
  navigateTo = vi.fn()
  fetchMock = vi.fn(async (url: string, opts?: any) => {
    if (url === '/api/devices') return devices
    if (url === '/api/new-device') return { name: opts.body.name }
    if (url.endsWith('/reconnect')) return {}
    throw new Error('unexpected ' + url)
  })
  vi.stubGlobal('$fetch', fetchMock)
  vi.stubGlobal('navigateTo', navigateTo)
  vi.stubGlobal('useFetch', async () => ({ data: ref(devices), refresh: vi.fn() }))
})
afterEach(() => { mounted?.unmount(); mounted = undefined; cleanup() })

describe('connect index', () => {
  it('lists devices linking to their connect page', async () => {
    await renderIndex()
    const link = await screen.findByRole('link', { name: /Luis \(luis-cel\) — pending/ })
    expect(link.getAttribute('href')).toBe('/connect/luis-cel')
  })
  it('adds a device and goes to its page', async () => {
    const user = userEvent.setup()
    await renderIndex()
    await user.type(screen.getByLabelText(/Name/), 'new-phone')
    await user.click(screen.getByRole('button', { name: 'Add Device' }))
    await waitFor(() => expect(navigateTo).toHaveBeenCalledWith('/connect/new-phone'))
    expect(fetchMock).toHaveBeenCalledWith('/api/new-device', expect.objectContaining({ method: 'POST', body: { name: 'new-phone', label: '' } }))
  })
  it('shows the server error', async () => {
    fetchMock.mockImplementation(async () => { throw { data: { statusMessage: 'already exists' } } })
    const user = userEvent.setup()
    await renderIndex()
    await user.type(screen.getByLabelText(/Name/), 'dup')
    await user.click(screen.getByRole('button', { name: 'Add Device' }))
    expect((await screen.findByRole('alert')).textContent).toBe('already exists')
  })
})

describe('connect device page', () => {
  it('shows the QR code while pending', async () => {
    render(Device, { global: { stubs } })
    const img = await screen.findByAltText('QR code')
    expect(img.getAttribute('src')).toMatch(/^\/api\/devices\/luis-cel\/qr\.png\?t=/)
    expect(screen.getByRole('button', { name: 'Refresh QR code' })).toBeTruthy()
  })
  it('shows connected', async () => {
    devices[1].status = 'connected'
    render(Device, { global: { stubs } })
    expect(await screen.findByText(/Connected/)).toBeTruthy()
    expect(screen.queryByAltText('QR code')).toBeNull()
  })
  it('offers Reconnect when disconnected', async () => {
    devices[1].status = 'disconnected'
    const user = userEvent.setup()
    render(Device, { global: { stubs } })
    await user.click(await screen.findByRole('button', { name: 'Reconnect' }))
    expect(fetchMock).toHaveBeenCalledWith('/api/devices/luis-cel/reconnect', { method: 'POST' })
  })
})
