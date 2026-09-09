# Framework-Specific Testing with Vite

This reference provides detailed guidance for testing applications built with different frameworks in Vite projects.

## Vue.js Testing

### Setup Requirements
- `@vue/test-utils` - Official Vue testing utilities
- `jsdom` - DOM environment for component testing
- `@vitejs/plugin-vue` - Vue plugin for Vite (should already be in your Vite config)

### Basic Component Test
```typescript
import { mount } from '@vue/test-utils'
import HelloWorld from '@/components/HelloWorld.vue'

describe('HelloWorld.vue', () => {
  it('renders props.msg when passed', () => {
    const msg = 'new message'
    const wrapper = mount(HelloWorld, {
      props: { msg }
    })
    expect(wrapper.text()).toContain(msg)
  })
})
```

### Testing Composables
```typescript
import { useCounter } from '@/composables/useCounter'
import { describe, it, expect } from 'vitest'

describe('useCounter', () => {
  it('increments count', () => {
    const { count, increment } = useCounter()
    expect(count.value).toBe(0)
    increment()
    expect(count.value).toBe(1)
  })
})
```

### Mocking Vue Router
```typescript
import { createRouter, createWebHistory } from 'vue-router'
import { install } from '@vue/test-utils'

// Create a mock router
const router = createRouter({
  history: createWebHistory(),
  routes: []
})

// Install globally or per-component
install({ global: { plugins: [router] } })
```

## React Testing

### Setup Requirements
- `@testing-library/react` - React Testing Library
- `jsdom` - DOM environment
- `@vitejs/plugin-react` - React plugin for Vite

### Basic Component Test
```typescript
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Greeting from '@/components/Greeting'

describe('Greeting', () => {
  it('displays greeting message', () => {
    render(<Greeting name="John" />)
    expect(screen.getByText('Hello, John!')).toBeInTheDocument()
  })

  it('handles button click', async () => {
    const user = userEvent.setup()
    render(<Greeting name="John" />)
    await user.click(screen.getByRole('button'))
    expect(screen.getByText('Clicked!')).toBeInTheDocument()
  })
})
```

### Testing Custom Hooks
```typescript
import { renderHook, act } from '@testing-library/react'
import { useCounter } from '@/hooks/useCounter'

describe('useCounter', () => {
  it('increments count', () => {
    const { result } = renderHook(() => useCounter())
    expect(result.current.count).toBe(0)
    
    act(() => {
      result.current.increment()
    })
    
    expect(result.current.count).toBe(1)
  })
})
```

### Mocking React Context
```typescript
import { render } from '@testing-library/react'
import { ThemeProvider } from '@/context/ThemeContext'

const renderWithTheme = (component: React.ReactNode) => {
  return render(
    <ThemeProvider value="dark">
      {component}
    </ThemeProvider>
  )
}
```

## Svelte Testing

### Setup Requirements
- `@testing-library/svelte` - Svelte Testing Library
- `jsdom` - DOM environment
- `@sveltejs/vite-plugin-svelte` - Svelte plugin for Vite

### Basic Component Test
```typescript
import { render, screen } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'
import Counter from '@/components/Counter.svelte'

describe('Counter', () => {
  it('starts at 0', () => {
    render(Counter)
    expect(screen.getByText('Count: 0')).toBeInTheDocument()
  })

  it('increments on button click', async () => {
    const user = userEvent.setup()
    render(Counter)
    await user.click(screen.getByRole('button'))
    expect(screen.getByText('Count: 1')).toBeInTheDocument()
  })
})
```

### Testing Stores
```typescript
import { get } from 'svelte/store'
import { writable } from 'svelte/store'
import { describe, it, expect } from 'vitest'

describe('writable store', () => {
  it('updates value', () => {
    const store = writable(0)
    expect(get(store)).toBe(0)
    store.set(1)
    expect(get(store)).toBe(1)
  })
})
```

## Vanilla JavaScript/TypeScript

### Testing Utilities
For non-framework projects, focus on pure functions and utilities:

```typescript
import { formatDate, validateEmail } from '@/utils'

describe('formatDate', () => {
  it('formats ISO date correctly', () => {
    const date = new Date('2023-01-01T00:00:00Z')
    expect(formatDate(date)).toBe('January 1, 2023')
  })
})

describe('validateEmail', () => {
  it('returns true for valid emails', () => {
    expect(validateEmail('test@example.com')).toBe(true)
  })

  it('returns false for invalid emails', () => {
    expect(validateEmail('invalid-email')).toBe(false)
  })
})
```

### Testing Async Functions
```typescript
import { fetchData } from '@/api'
import { vi } from 'vitest'

describe('fetchData', () => {
  beforeEach(() => {
    // Mock fetch globally
    vi.stubGlobal('fetch', vi.fn())
  })

  it('fetches data successfully', async () => {
    const mockResponse = { id: 1, name: 'Test' }
    global.fetch.mockResolvedValue({
      json: () => Promise.resolve(mockResponse)
    })

    const result = await fetchData('/api/data')
    expect(result).toEqual(mockResponse)
    expect(global.fetch).toHaveBeenCalledWith('/api/data')
  })
})
```

## Common Patterns Across Frameworks

### Mocking API Calls
```typescript
// Using vi.mock for module-level mocking
vi.mock('@/api/user', () => ({
  getUser: vi.fn().mockResolvedValue({ id: 1, name: 'John' }),
  updateUser: vi.fn().mockResolvedValue({ success: true })
}))

// Using vi.spyOn for instance-level mocking
const api = {
  fetchUser: async (id) => ({ id, name: 'John' })
}

const spy = vi.spyOn(api, 'fetchUser')
```

### Handling Environment Variables
```typescript
// In setup file
process.env.VITE_API_URL = 'http://localhost:3000'
process.env.VITE_FEATURE_FLAG = 'true'

// In tests
describe('FeatureFlagComponent', () => {
  it('shows feature when flag is enabled', () => {
    // Component will use process.env.VITE_FEATURE_FLAG
    const wrapper = mount(FeatureFlagComponent)
    expect(wrapper.find('.feature').exists()).toBe(true)
  })
})
```

### Testing Error Boundaries/Catch Blocks
```typescript
import { catchError } from '@/utils'

describe('catchError', () => {
  it('catches and handles errors', () => {
    const errorFn = () => {
      throw new Error('Test error')
    }
    
    const result = catchError(errorFn, 'default')
    expect(result).toBe('default')
  })
})
```

## Framework-Specific Gotchas

### Vue
- **Reactivity**: Use `await nextTick()` after state changes
- **Async Components**: Use `await flushPromises()` for async setup
- **Slots**: Pass slots as objects in mount options

### React
- **Async Updates**: Wrap state updates in `act()`
- **Effects**: Use `waitFor` for effects that run after render
- **Context**: Provide context providers in test setup

### Svelte
- **Reactivity**: Use `tick()` to wait for reactive updates
- **Stores**: Remember to unsubscribe in cleanup
- **Transitions**: Mock transitions for faster tests

### General
- **Timers**: Use fake timers for time-dependent code
- **Randomness**: Mock Math.random() for consistent results
- **Date**: Mock Date constructor for time-based tests

## Performance Tips

### Fast Tests
- Mock expensive operations (API calls, file system)
- Use shallow rendering when possible
- Avoid real network requests
- Mock animations and transitions

### Parallel Execution
Vitest runs tests in parallel by default. Ensure tests are independent:
- Don't share global state between tests
- Clean up after each test (use `afterEach`)
- Mock external dependencies consistently

### Coverage Optimization
- Focus on critical paths and edge cases
- Don't test framework internals
- Test business logic, not implementation details
- Use coverage reports to identify gaps

---

Remember to adjust your testing strategy based on your specific framework and project requirements. The key is to test behavior rather than implementation, ensuring your tests remain maintainable as your code evolves.