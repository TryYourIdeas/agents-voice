import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import MockChat from '../components/MockChat.vue'
import MockFileList from '../components/MockFileList.vue'
import MockFileView from '../components/MockFileView.vue'
import MockInboxList from '../components/MockInboxList.vue'
import MockSentList from '../components/MockSentList.vue'
import MockEmailView from '../components/MockEmailView.vue'

afterEach(cleanup)
const emails = [
  { uid: 1, from: 'ann@x.com', to: 'me@x.com', subject: 'Invoice', date: '2026-11-20', body: 'Please pay <script>alert(1)</script>' },
  { uid: 2, from: 'bob@x.com', to: 'me@x.com', subject: 'Lunch', body: 'Noon?' },
]

describe('MockChat', () => {
  it('renders messages in order with their kind', () => {
    render(MockChat, { props: { messages: [{ kind: 'reply', text: 'Hello <b>there</b>' }, { kind: 'audio', text: 'say this' }] } })
    const list = screen.getByRole('list', { name: 'Chat' })
    expect(list.querySelectorAll('li')).toHaveLength(2)
    expect(screen.getByText('Hello <b>there</b>')).toBeTruthy() // literal, not HTML
    expect(screen.getByText('Voice note')).toBeTruthy()
  })
  it('shows an empty state', () => {
    render(MockChat, { props: { messages: [] } })
    expect(screen.getByText('No messages yet.')).toBeTruthy()
  })
})

describe('MockFileList / MockFileView', () => {
  it('lists files, emits select on click and keyboard, marks the selected one', async () => {
    const user = userEvent.setup()
    const { emitted } = render(MockFileList, { props: { files: [{ path: 'a.txt' }, { path: 'docs/b.md' }], selected: 'a.txt' } })
    expect(screen.getByRole('button', { name: 'a.txt' }).getAttribute('aria-current')).toBe('true')
    expect(screen.getByRole('button', { name: 'docs/b.md' }).getAttribute('aria-current')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'docs/b.md' }))
    screen.getByRole('button', { name: 'a.txt' }).focus()
    await user.keyboard('{Enter}')
    expect(emitted().select).toEqual([['docs/b.md'], ['a.txt']])
  })
  it('file list empty state', () => {
    render(MockFileList, { props: { files: [] } })
    expect(screen.getByText('No files.')).toBeTruthy()
  })
  it('file view shows the content as literal text, or an empty state', () => {
    const { unmount } = render(MockFileView, { props: { file: { path: 'a.html', content: '<script>x</script>' } } })
    expect(screen.getByText('a.html')).toBeTruthy()
    expect(screen.getByText('<script>x</script>').tagName).toBe('PRE')
    unmount()
    render(MockFileView, { props: {} })
    expect(screen.getByText('Select a file to see its contents.')).toBeTruthy()
  })
})

describe('MockInboxList / MockSentList', () => {
  it('inbox list shows sender and subject, emits select with the uid, marks the selected one', async () => {
    const user = userEvent.setup()
    const { emitted } = render(MockInboxList, { props: { emails, selectedUid: 2 } })
    expect(screen.getByRole('button', { name: /Invoice/ }).textContent).toContain('ann@x.com')
    expect(screen.getByRole('button', { name: /Lunch/ }).getAttribute('aria-current')).toBe('true')
    await user.click(screen.getByRole('button', { name: /Invoice/ }))
    expect(emitted().select).toEqual([[1]])
  })
  it('sent list shows recipient and subject and emits select', async () => {
    const user = userEvent.setup()
    const { emitted } = render(MockSentList, { props: { emails } })
    expect(screen.getByRole('button', { name: /Invoice/ }).textContent).toContain('me@x.com')
    await user.click(screen.getByRole('button', { name: /Lunch/ }))
    expect(emitted().select).toEqual([[2]])
  })
  it('empty states', () => {
    const a = render(MockInboxList, { props: { emails: [] } })
    expect(screen.getByText('The inbox is empty.')).toBeTruthy()
    a.unmount()
    render(MockSentList, { props: { emails: [] } })
    expect(screen.getByText('Nothing sent yet.')).toBeTruthy()
  })
})

describe('MockEmailView', () => {
  it('shows headers and the body as literal text', () => {
    render(MockEmailView, { props: { email: emails[0] } })
    expect(screen.getByText('Invoice')).toBeTruthy()
    expect(screen.getByText('ann@x.com')).toBeTruthy()
    expect(screen.getByText('Please pay <script>alert(1)</script>').tagName).toBe('PRE')
  })
  it('empty state', () => {
    render(MockEmailView, { props: {} })
    expect(screen.getByText('Select an email to read it.')).toBeTruthy()
  })
})
