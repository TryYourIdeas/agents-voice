import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, within, cleanup } from '@testing-library/vue'
import Home from '../pages/index.vue'

const stubs = { NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } }
afterEach(cleanup)

describe('home page', () => {
  it('has a heading and a labelled navigation with the tools', () => {
    render(Home, { global: { stubs } })
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Agents Voice')
    const nav = within(screen.getByRole('navigation', { name: 'Tools' }))
    const links = nav.getAllByRole('link')
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/tts', '/connect', '/models', '/logs'])
  })

  it('gives each link an accessible name and description', () => {
    render(Home, { global: { stubs } })
    expect(screen.getByRole('link', { name: /Text to speech/ })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Connect devices/ })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Agent logs/ })).toBeTruthy()
  })
})
