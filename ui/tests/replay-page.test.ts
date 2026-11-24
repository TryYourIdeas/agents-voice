import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/vue'

vi.mock('vue-router', () => ({ useRoute: () => ({ params: { turnId: '7' } }) }))
import Replay from '../pages/replay/[turnId].vue'

const stubs = { NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } }
const original = { id: 7, agent: 'default', status: 'ok', user_message: 'summarize my mail', reasoning_model: 'LFM3-1.7B' }
const configs = [{ id: 3, name: 'Qwen', model: 'qwen3.5-4b', base_url: 'http://h:1', has_key: true, key_tail: '9999' }]
const sandbox = {
  files: [{ path: 'notes/a.txt', content: 'file body text', origin: 'seeded' }],
  inbox: [{ uid: 1, from: 'ann@x.com', to: 'me', subject: 'Invoice', date: null, body: 'Please pay', inReplyToUid: null }],
  sent: [{ uid: 1, from: 'me', to: 'ann@x.com', subject: 'Re: Invoice', date: null, body: 'Paid', inReplyToUid: 1 }],
  messages: [{ seq: 1, kind: 'reply', text: 'Here is your summary', ts: 't' }],
}
let fetchMock: ReturnType<typeof vi.fn>
let replayStatus: { status: string; error?: string }
let cfgs: any[]

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  cfgs = configs
  replayStatus = { status: 'ok' }
  fetchMock = vi.fn(async (url: string, opts?: any) => {
    if (url === '/api/logs/turns/7') return original
    if (url === '/api/model-configs') return cfgs
    if (url === '/api/replay') return { replayTurnId: 9 }
    if (url === '/api/logs/turns/9') return { id: 9, replay_of: 7, reasoning_model: 'qwen3.5-4b', final_response: 'Here is your summary', tokens: { input_tokens: 10, output_tokens: 2 }, ...replayStatus }
    if (url === '/api/logs/turns/9/sandbox') return sandbox
    throw new Error('unexpected ' + url)
  })
  vi.stubGlobal('$fetch', fetchMock)
})
afterEach(() => { cleanup(); vi.useRealTimers() })

async function run() {
  render(Replay, { global: { stubs } })
  await screen.findByText('summarize my mail')
  await fireEvent.update(screen.getByLabelText('Model configuration'), '3')
  await fireEvent.click(screen.getByRole('button', { name: 'Run replay' }))
}

describe('replay page', () => {
  it('shows the original message and keeps Run disabled until a model is chosen', async () => {
    render(Replay, { global: { stubs } })
    expect(await screen.findByText('summarize my mail')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Run replay' }) as HTMLButtonElement).disabled).toBe(true)
    await fireEvent.update(screen.getByLabelText('Model configuration'), '3')
    expect((screen.getByRole('button', { name: 'Run replay' }) as HTMLButtonElement).disabled).toBe(false)
  })
  it('links to the models page when there are no configurations', async () => {
    cfgs = []
    render(Replay, { global: { stubs } })
    expect((await screen.findByRole('link', { name: /Add a model configuration/ })).getAttribute('href')).toBe('/models')
  })
  it('posts the replay, then shows the chat, a clicked file, and the mailbox', async () => {
    await run()
    expect(fetchMock).toHaveBeenCalledWith('/api/replay', { method: 'POST', body: { turnId: 7, modelConfigId: 3 } })
    expect(await screen.findByText('Here is your summary', { selector: 'p' })).toBeTruthy()
    await fireEvent.click(await screen.findByRole('button', { name: 'notes/a.txt' }))
    expect(screen.getByText('file body text')).toBeTruthy()
    await fireEvent.click(screen.getByRole('button', { name: /^Invoice/ }))
    expect(screen.getByText('Please pay')).toBeTruthy()
    await fireEvent.click(screen.getByRole('button', { name: /^Re: Invoice/ }))
    expect(screen.getByText('Paid')).toBeTruthy()
  })
  it('keeps polling while running and stops when finished', async () => {
    replayStatus = { status: 'running' }
    await run()
    await screen.findByText('Running… this page updates by itself.')
    const polls = () => fetchMock.mock.calls.filter((c) => c[0] === '/api/logs/turns/9').length
    await vi.advanceTimersByTimeAsync(3200)
    expect(polls()).toBeGreaterThan(1)
    replayStatus = { status: 'ok' }
    await vi.advanceTimersByTimeAsync(1600)
    const after = polls()
    await vi.advanceTimersByTimeAsync(5000)
    expect(polls()).toBe(after)
  })
  it('shows the error of a failed replay and stops polling', async () => {
    replayStatus = { status: 'error', error: 'connect ECONNREFUSED http://h:1' }
    await run()
    expect((await screen.findByRole('alert')).textContent).toContain('ECONNREFUSED')
    const n = fetchMock.mock.calls.length
    await vi.advanceTimersByTimeAsync(5000)
    expect(fetchMock.mock.calls.length).toBe(n)
  })
  it('shows the server message when the replay cannot start', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/logs/turns/7') return original
      if (url === '/api/model-configs') return configs
      throw { data: { error: 'Model configuration 3 not found.' } }
    })
    await run()
    expect((await screen.findByRole('alert')).textContent).toContain('not found')
  })
})
