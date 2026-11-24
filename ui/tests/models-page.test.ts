import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import Models from '../pages/models/index.vue'

const stubs = { NuxtLink: { template: '<a><slot /></a>' } }
afterEach(cleanup)
let configs: any[]
let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  configs = [{ id: 1, name: 'lfm', model: 'LFM3-1.7B', base_url: 'http://llama:5050', has_key: true, key_tail: '1234' }]
  fetchMock = vi.fn(async (url: string, opts?: any) => {
    if (url === '/api/model-configs' && !opts?.method) return configs
    return { ok: true }
  })
  vi.stubGlobal('$fetch', fetchMock)
})

describe('models page', () => {
  it('lists configurations with a masked key', async () => {
    render(Models, { global: { stubs } })
    expect(await screen.findByText('LFM3-1.7B')).toBeTruthy()
    expect(screen.getByText('http://llama:5050')).toBeTruthy()
    expect(screen.getByText('••••1234')).toBeTruthy()
  })
  it('Add opens an accessible form and posts it', async () => {
    const user = userEvent.setup()
    render(Models, { global: { stubs } })
    await screen.findByText('LFM3-1.7B')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await user.type(screen.getByLabelText('Name'), 'big')
    await user.type(screen.getByLabelText('Model name'), 'qwen3.5-4b')
    await user.type(screen.getByLabelText('Base URL'), 'http://h:1')
    await user.type(screen.getByLabelText('API key'), 'k')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => c[1]?.method === 'POST')!
      expect(call[0]).toBe('/api/model-configs')
      expect(call[1].body).toEqual({ name: 'big', model: 'qwen3.5-4b', base_url: 'http://h:1', api_key: 'k' })
    })
  })
  it('Edit prefills the form with a blank key field and PUTs without a key when left blank', async () => {
    const user = userEvent.setup()
    render(Models, { global: { stubs } })
    await screen.findByText('LFM3-1.7B')
    await user.click(screen.getByRole('button', { name: 'Edit lfm' }))
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('lfm')
    expect((screen.getByLabelText('API key') as HTMLInputElement).value).toBe('')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => c[1]?.method === 'PUT')!
      expect(call[0]).toBe('/api/model-configs/1')
      expect(call[1].body.api_key).toBe('')
    })
  })
  it('shows the server error message', async () => {
    fetchMock.mockImplementation(async (url: string, opts?: any) => {
      if (opts?.method === 'POST') throw { data: { statusMessage: 'A configuration named "lfm" already exists.' } }
      return configs
    })
    const user = userEvent.setup()
    render(Models, { global: { stubs } })
    await screen.findByText('LFM3-1.7B')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await user.type(screen.getByLabelText('Name'), 'lfm')
    await user.type(screen.getByLabelText('Model name'), 'm')
    await user.type(screen.getByLabelText('Base URL'), 'http://h:1')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect((await screen.findByRole('alert')).textContent).toContain('already exists')
  })
})
