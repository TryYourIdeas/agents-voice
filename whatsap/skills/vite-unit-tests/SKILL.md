---
name: vite-unit-tests
description: Configure, write, and run unit tests for Vite projects using Vitest or other testing frameworks. Use when setting up test environments, writing test cases, debugging test failures, or optimizing test performance in Vite-based applications.
license: MIT
metadata:
  author: agentskills
  version: "1.1"
allowed-tools: Read Write Execute
---

# Vite Unit Tests Skill

This skill helps you configure, write, and run unit tests for Vite projects. Vite supports multiple testing frameworks, with Vitest being the most integrated option, but also works well with Jest, Cypress Component Testing, and others.

## When to Use This Skill

Use this skill when:
- Setting up a new Vite project with unit testing
- Configuring Vitest or other test frameworks for Vite
- Writing unit tests for Vue, React, Svelte, or vanilla JavaScript/TypeScript components
- Debugging test failures or configuration issues
- Optimizing test performance and coverage
- Migrating from other test setups to Vite-compatible testing
- Needing help with test utilities, mocks, or fixtures

## Supported Testing Frameworks

### Vitest (Recommended)
- Native Vite integration
- Fast, ESM-first testing framework
- Compatible with Jest APIs
- Built-in coverage, watch mode, and UI

### Testing Library Integration
Testing Library is a family of libraries that encourage testing user behavior rather than implementation details. It works excellently with Vitest and Vite:

- **@testing-library/react** - For React applications
- **@testing-library/vue** - For Vue applications  
- **@testing-library/svelte** - For Svelte applications
- **@testing-library/dom** - For vanilla DOM testing
- **@testing-library/user-event** - For simulating user interactions

### Jest with Vite
- Requires additional configuration
- Good for existing Jest projects migrating to Vite
- Uses babel-jest or ts-jest for transformation

### Other Options
- Cypress Component Testing
- Playwright Test
- Custom test setups

## Getting Started with Vitest and Testing Library

### Installation
```bash
# Basic Vitest setup
npm install -D vitest

# With Testing Library (choose based on your framework)
npm install -D @testing-library/react @testing-library/user-event    # React
npm install -D @testing-library/vue @testing-library/user-event      # Vue  
npm install -D @testing-library/svelte @testing-library/user-event   # Svelte

# Required for DOM testing
npm install -D jsdom

# Optional: Vitest UI and coverage
npm install -D @vitest/ui
```

### Basic Configuration (vite.config.ts)
```typescript
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue' // or react(), svelte()

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    deps: {
      // Inline framework dependencies for proper ESM handling
      inline: ['@vue/test-utils'] // For Vue
      // inline: ['react', 'react-dom'] // For React
    }
  },
})
```

### Package.json Scripts
```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:run": "vitest run",
    "test:coverage": "vitest run --coverage"
  }
}
```

## Writing Effective Tests with Testing Library

### Testing Library Philosophy
Testing Library encourages testing that resembles how users interact with your application:
- **Query by text content** that users see
- **Query by accessibility attributes** (labels, roles, etc.)
- **Avoid testing implementation details** like component state or props
- **Focus on user behavior** and expected outcomes

### Common Testing Library Queries
```typescript
// By text content (visible to users)
screen.getByText('Submit')
screen.queryByText('Success message') // Returns null if not found
screen.findAllByText(/error/i) // Returns array, waits for async

// By accessibility attributes
screen.getByRole('button', { name: /submit/i })
screen.getByLabelText('Email address')
screen.getByPlaceholderText('Enter your name')

// By test IDs (use sparingly, only for impossible cases)
screen.getByTestId('modal-close-button')
```

### Test Structure with AAA Pattern
Follow the Arrange, Act, Assert pattern:

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

describe('LoginForm', () => {
  // Arrange: Setup before each test
  const setup = () => {
    const user = userEvent.setup()
    render(<LoginForm />)
    return { user }
  }

  it('submits form with valid credentials', async () => {
    const { user } = setup()
    
    // Act: Simulate user interactions
    await user.type(screen.getByLabelText('Email'), 'test@example.com')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))
    
    // Assert: Verify expected outcomes
    expect(screen.getByText('Welcome!')).toBeInTheDocument()
  })
})
```

### Framework-Specific Examples

#### Testing React Components
```typescript
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Counter from '@/components/Counter'

describe('Counter', () => {
  it('increments count when button clicked', async () => {
    const user = userEvent.setup()
    render(<Counter />)
    
    expect(screen.getByText('Count: 0')).toBeInTheDocument()
    
    await user.click(screen.getByRole('button', { name: /increment/i }))
    
    expect(screen.getByText('Count: 1')).toBeInTheDocument()
  })

  it('handles async operations', async () => {
    render(<DataFetcher />)
    
    // Wait for loading state
    expect(screen.getByText('Loading...')).toBeInTheDocument()
    
    // Wait for data to load
    await screen.findByText('Data loaded successfully')
    
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
  })
})
```

#### Testing Vue Components
```typescript
import { render, screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import Counter from '@/components/Counter.vue'

describe('Counter', () => {
  it('increments count when button clicked', async () => {
    const user = userEvent.setup()
    render(Counter)
    
    expect(screen.getByText('Count: 0')).toBeInTheDocument()
    
    await user.click(screen.getByRole('button', { name: /increment/i }))
    
    expect(screen.getByText('Count: 1')).toBeInTheDocument()
  })
})
```

#### Testing Svelte Components
```typescript
import { render, screen } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'
import Counter from '@/components/Counter.svelte'

describe('Counter', () => {
  it('increments count when button clicked', async () => {
    const user = userEvent.setup()
    render(Counter)
    
    expect(screen.getByText('Count: 0')).toBeInTheDocument()
    
    await user.click(screen.getByRole('button', { name: /increment/i }))
    
    expect(screen.getByText('Count: 1')).toBeInTheDocument()
  })
})
```

## Advanced Testing Library Patterns

### Handling Async Operations
```typescript
// waitFor - wait for condition to be true
await waitFor(() => {
  expect(screen.getByText('Updated!')).toBeInTheDocument()
})

// findBy queries - automatically wait and find elements
const successMessage = await screen.findByText('Operation completed')
expect(successMessage).toBeInTheDocument()

// waitForElementToBeRemoved - wait for element to disappear
await waitForElementToBeRemoved(() => screen.getByText('Loading...'))
```

### Mocking with Testing Library
```typescript
// Mock API calls
vi.mock('@/api/auth', () => ({
  login: vi.fn().mockResolvedValue({ token: 'fake-token' })
}))

// Mock modules that Testing Library components depend on
vi.mock('axios', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: { id: 1, name: 'Test' } })
  }
}))
```

### Custom Render Functions
```typescript
// Create custom render with providers/context
const customRender = (ui, options = {}) => {
  return render(ui, {
    wrapper: ({ children }) => (
      <AuthProvider>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </AuthProvider>
    ),
    ...options,
  })
}

// Use in tests
customRender(<ProtectedComponent />)
```

## Mocking and Stubbing

### Mocking Modules
```typescript
// Mock an entire module
vi.mock('@/api/user', () => ({
  getUser: vi.fn().mockResolvedValue({ id: 1, name: 'John' })
}))

// Mock specific functions
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)
```

### Mocking Environment Variables
```typescript
// In setup file or test
process.env.VITE_API_URL = 'http://localhost:3000'
```

### Working with Timers
```typescript
beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

it('handles timeouts correctly', () => {
  // Your test code
  vi.advanceTimersByTime(5000)
})
```

## Common Configuration Issues

### TypeScript Support
Ensure your `tsconfig.json` includes:
```json
{
  "compilerOptions": {
    "types": ["vitest/globals"]
  }
}
```

### CSS and Asset Handling
For component tests that import CSS:
```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    deps: {
      inline: ['@vue/test-utils'] // or your component library
    }
  }
})
```

### Environment Setup
For DOM testing, use jsdom:
```typescript
// vite.config.ts
export default defineConfig({
  test: {
    environment: 'jsdom'
  }
})
```

## Debugging Tests

### Common Error Patterns

#### Module Import Issues
- **Problem**: "Cannot find module" errors
- **Solution**: Check Vite aliases and ensure proper ESM/CJS compatibility

#### DOM Not Available
- **Problem**: "document is not defined"
- **Solution**: Ensure `environment: 'jsdom'` is set in test config

#### Async Test Timeouts
- **Problem**: Tests hanging or timing out
- **Solution**: Properly await async operations and mock external calls

### Debugging Techniques

1. **Use `.only()` to focus on specific tests**:
   ```typescript
   it.only('runs only this test', () => { /* ... */ })
   ```

2. **Add console logs**:
   ```typescript
   console.log('Debug info:', variable)
   ```

3. **Use debugger statements**:
   ```typescript
   debugger // Will pause in debug mode
   ```

4. **Run with verbose output**:
   ```bash
   vitest --reporter verbose
   ```

5. **Debug Testing Library queries**:
   ```typescript
   // Log available queries for debugging
   screen.debug() // Logs current DOM state
   console.log(screen.getAllByRole('button')) // See all buttons
   ```

## Performance Optimization

### Speed Up Tests
- Use `--no-threads` for simpler debugging
- Mock expensive operations (API calls, file system)
- Use `vi.mock()` to replace slow modules
- Consider test sharding for large suites

### Coverage Configuration
```typescript
// vite.config.ts
export default defineConfig({
  test: {
    coverage: {
      provider: 'istanbul', // or 'c8'
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/']
    }
  }
})
```

## Migration from Jest

### Key Differences
- Vitest uses native ESM, Jest uses CJS by default
- Different global APIs (though Vitest supports Jest compatibility mode)
- Faster startup time with Vite's dev server

### Migration Steps
1. Replace `jest` imports with `vitest`
2. Update configuration from `jest.config.js` to Vite config
3. Adjust mocking syntax if needed
4. Update coverage configuration

## Best Practices

1. **Test behavior, not implementation**
2. **Keep tests independent and isolated**
3. **Use descriptive test names**
4. **Mock external dependencies**
5. **Test edge cases and error conditions**
6. **Maintain good test coverage without obsessing over 100%**
7. **Run tests in CI/CD pipeline**
8. **Use Testing Library queries that match user experience**
9. **Prefer `userEvent` over direct fireEvent for realistic interactions**
10. **Handle async operations properly with await and proper queries**

## Quick Reference Commands

| Command | Description |
|---------|-------------|
| `vitest` | Run tests in watch mode |
| `vitest run` | Run tests once |
| `vitest --ui` | Open Vitest UI |
| `vitest --coverage` | Generate coverage report |
| `vitest -t "pattern"` | Run tests matching pattern |
| `vitest --reporter=json` | Output results in JSON format |

## Troubleshooting Checklist

- [ ] Vite and Vitest versions are compatible
- [ ] Test environment is properly configured (jsdom for DOM tests)
- [ ] TypeScript types are correctly set up
- [ ] Aliases and paths match between Vite and test config
- [ ] External dependencies are properly mocked
- [ ] Async operations are properly awaited
- [ ] Global variables are properly stubbed
- [ ] Testing Library packages are installed for your framework
- [ ] User interactions are simulated with `userEvent.setup()`

---

For framework-specific testing (Vue, React, Svelte), consult the respective testing library documentation along with this general Vite testing guidance. Always prioritize testing user behavior over implementation details for more maintainable and reliable tests.