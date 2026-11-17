import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within, cleanup } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import Logs from '../pages/logs.vue'

const stubs = { NuxtLink: { template: '<a><slot /></a>' } }
const stats = {
  totals: { turns: 2, errors: 1, recursion_limits: 0, avg_duration_ms: 150 },
  agents: [{ agent: 'default' }, { agent: 'mail' }],
  tools: [{ name: 'echo', calls: 2, errors: 1, avg_duration_ms: 20 }],
  tokens: [],
}
const row = (o: any) => ({ id: 1, started_at: '2026-11-17T10:00:00Z', agent: 'default', status: 'ok', user_message: 'hello', final_response: 'hi there', tool_calls: 0, sub_agent_turns: 0, duration_ms: 12, ...o })
const detail = {
  id: 2, agent: 'default', status: 'ok', source: 'chat', duration_ms: 50, started_at: 'x', user_message: 'check mail', final_response: 'You have 3',
  events: [
    { id: 1, kind: 'model', content: 'calling', data: { tool_calls: [{ id: 'c', name: 'delegate_to_agent', args: {} }] }, status: 'ok' },
    { id: 2, kind: 'tool', name: 'delegate_to_agent', input: { agentName: 'mail' }, content: 'sub reply', status: 'ok' },
  ],
  children: [{ id: 3, agent: 'mail', status: 'ok', source: 'delegated', user_message: 'task', final_response: 'sub reply', events: [], children: [] }],
}

afterEach(cleanup)
let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/logs/stats') return stats
    if (url === '/api/logs/turns') return { total: 2, turns: [row({ id: 2, user_message: 'check mail' }), row({ id: 1, status: 'error', final_response: null, error: 'boom' })] }
    if (url === '/api/logs/turns/2') return detail
    throw new Error('unexpected ' + url)
  })
  vi.stubGlobal('$fetch', fetchMock)
})

describe('logs page', () => {
  it('lists turns and shows the summary', async () => {
    render(Logs, { global: { stubs } })
    expect(await screen.findByText('check mail')).toBeTruthy()
    expect(screen.getByText('boom')).toBeTruthy()
    const summary = within(screen.getByLabelText('Summary'))
    const stat = (label: string) => summary.getAllByText(label).find((el) => el.tagName === 'SPAN')!.nextElementSibling!.textContent
    expect(stat('Turns')).toBe('2')
    expect(stat('Errors')).toBe('1')
  })

  it('passes filters to the API and resets to the first page', async () => {
    const user = userEvent.setup()
    render(Logs, { global: { stubs } })
    await screen.findByText('check mail')
    await user.type(screen.getByLabelText('Search'), 'acif')
    await user.selectOptions(screen.getByLabelText('Status'), 'error')
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    await waitFor(() => {
      const last = fetchMock.mock.calls.filter((c) => c[0] === '/api/logs/turns').at(-1)!
      expect(last[1].query).toMatchObject({ q: 'acif', status: 'error', offset: 0 })
    })
  })

  it('opens a turn with its steps and sub-agent turns', async () => {
    const user = userEvent.setup()
    render(Logs, { global: { stubs } })
    await user.click(await screen.findByRole('button', { name: 'Open turn 2' }))
    const detailRegion = await screen.findByLabelText('Turn detail')
    expect(within(detailRegion).getByText('tool: delegate_to_agent')).toBeTruthy()
    expect(within(detailRegion).getByText('Sub-agent turns')).toBeTruthy()
    expect(within(detailRegion).getByLabelText('Turn 3 (mail)')).toBeTruthy()
  })

  it('shows the API error as an alert', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      throw { data: { statusMessage: 'Agent log database not found at /x' } }
    })
    render(Logs, { global: { stubs } })
    expect((await screen.findByRole('alert')).textContent).toContain('not found at /x')
  })
})
