# Vitest Configuration Reference

This document provides comprehensive guidance on configuring Vitest for Vite projects, including advanced options and troubleshooting.

## Basic Configuration Structure

Vitest can be configured in several ways:

### 1. Separate vitest.config.ts
```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Vitest-specific options
  }
})
```

### 2. Within vite.config.ts
```typescript
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    // Vitest options here
  }
})
```

### 3. package.json
```json
{
  "vitest": {
    "environment": "jsdom"
  }
}
```

## Core Configuration Options

### Environment
```typescript
test: {
  // jsdom: Browser-like environment (for DOM testing)
  // node: Node.js environment (default)
  // happy-dom: Alternative to jsdom
  environment: 'jsdom',
  
  // Custom environment
  environmentOptions: {
    jsdom: {
      resources: 'usable', // Enable resource loading
      url: 'http://localhost:3000' // Set base URL
    }
  }
}
```

### Globals
```typescript
test: {
  // Make describe, it, expect available globally
  globals: true,
  
  // Custom global setup
  globalSetup: ['./src/test/global-setup.ts']
}
```

### File Patterns
```typescript
test: {
  // Include patterns
  include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
  
  // Exclude patterns
  exclude: ['node_modules/', 'dist/', '.git/', '**/fixtures/**'],
  
  // Test name pattern (run specific tests)
  testNamePattern: 'component|integration'
}
```

### Setup Files
```typescript
test: {
  // Files to run before each test file
  setupFiles: [
    './src/test/setup.ts',
    './src/test/mocks.ts'
  ],
  
  // Files to run once before all tests
  poolOptions: {
    threads: {
      singleThread: true // Run all tests in single thread
    }
  }
}
```

## Advanced Configuration

### Coverage Configuration
```typescript
test: {
  coverage: {
    // Provider: 'istanbul' or 'c8'
    provider: 'istanbul',
    
    // Reporters
    reporter: ['text', 'json', 'html', 'lcov'],
    
    // Output directory
    reportsDirectory: './coverage',
    
    // Exclude files/directories
    exclude: [
      'node_modules/',
      'dist/',
      'src/test/',
      '**/*.d.ts'
    ],
    
    // Thresholds (fail if not met)
    thresholds: {
      statements: 80,
      branches: 80,
      functions: 80,
      lines: 80
    }
  }
}
```

### Mocking Configuration
```typescript
test: {
  // Automatically mock modules
  mockReset: true,
  
  // Restore mocks between tests
  restoreMocks: true,
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Custom alias resolution for mocks
  alias: {
    '@': path.resolve(__dirname, './src')
  }
}
```

### Performance Configuration
```typescript
test: {
  // Number of workers (0 = CPU cores)
  pool: 'threads', // or 'forks'
  poolOptions: {
    threads: {
      minThreads: 1,
      maxThreads: 4
    }
  },
  
  // Disable isolation for faster tests
  isolate: false,
  
  // Disable file system watching
  watch: false,
  
  // Increase timeout for slow tests
  testTimeout: 10000,
  hookTimeout: 10000
}
```

### Reporting Configuration
```typescript
test: {
  // Reporters: 'default', 'verbose', 'json', 'junit', 'tap', 'html'
  reporters: ['default', 'html'],
  
  // Output file for reporters
  outputFile: {
    html: './reports/test-report.html',
    junit: './reports/test-results.xml'
  },
  
  // Silent console output during tests
  silent: false,
  
  // Hide skipped tests
  hideSkippedTests: false
}
```

## Framework-Specific Configuration

### Vue.js
```typescript
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    deps: {
      // Inline Vue dependencies for proper ESM handling
      inline: ['@vue/test-utils']
    }
  }
})
```

### React
```typescript
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    deps: {
      // Handle React's ESM/CJS issues
      inline: ['react', 'react-dom']
    }
  }
})
```

### TypeScript Projects
```typescript
// tsconfig.json
{
  "compilerOptions": {
    "types": ["vitest/globals", "vitest/importMeta"]
  }
}

// vite.config.ts
export default defineConfig({
  test: {
    typecheck: {
      enabled: true,
      checker: 'tsc' // or 'vue-tsc' for Vue projects
    }
  }
})
```

## Environment Variables in Tests

### Setting Environment Variables
```typescript
// In setup file
process.env.VITE_API_URL = 'http://localhost:3000'
process.env.VITE_MOCK_API = 'true'

// In individual tests
it('uses mock API', () => {
  const originalEnv = process.env.VITE_MOCK_API
  process.env.VITE_MOCK_API = 'true'
  
  // Your test code
  
  // Restore after test
  process.env.VITE_MOCK_API = originalEnv
})
```

### Using .env Files
```typescript
// Load .env.test if it exists
import { config } from 'dotenv'
config({ path: '.env.test' })
```

## Common Configuration Issues

### Module Resolution Problems
**Issue**: "Cannot find module" errors
**Solution**:
```typescript
test: {
  deps: {
    // Inline problematic dependencies
    inline: ['problematic-package']
  },
  alias: {
    // Match your Vite aliases
    '@': path.resolve(__dirname, './src')
  }
}
```

### CSS/Asset Import Issues
**Issue**: Tests fail when importing CSS/scss/assets
**Solution**:
```typescript
test: {
  deps: {
    // Inline packages that import CSS
    inline: ['your-component-library']
  }
}

// Or mock CSS files globally
vi.mock('./styles.css', () => ({}))
```

### TypeScript Type Errors
**Issue**: Type checking fails in tests
**Solution**:
```typescript
// tsconfig.json
{
  "include": ["src/**/*", "src/**/*.test.ts"],
  "compilerOptions": {
    "types": ["vitest/globals"]
  }
}
```

### DOM Testing Without jsdom
**Issue**: "document is not defined"
**Solution**:
```typescript
test: {
  environment: 'jsdom' // Required for DOM APIs
}
```

## Migration from Jest Configuration

### Equivalent Options
| Jest | Vitest |
|------|--------|
| `testMatch` | `include` |
| `testPathIgnorePatterns` | `exclude` |
| `setupFilesAfterEnv` | `setupFiles` |
| `moduleNameMapper` | `alias` |
| `collectCoverageFrom` | `coverage.include` |

### Example Migration
```javascript
// jest.config.js
module.exports = {
  testMatch: ['**/?(*.)+(spec|test).[jt]s?(x)'],
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  }
}

// vitest.config.ts
export default defineConfig({
  test: {
    include: ['src/**/*.{test,spec}.{js,ts,jsx,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
})
```

## Best Practices for Configuration

### 1. Keep Configuration DRY
- Use the same aliases in Vite and Vitest
- Share environment variables between dev and test
- Reuse setup files across test types

### 2. Environment-Specific Config
```typescript
// Different config for CI vs local
const isCI = process.env.CI === 'true'

export default defineConfig({
  test: {
    reporters: isCI ? ['junit', 'summary'] : ['default'],
    coverage: {
      enabled: isCI,
      reporter: isCI ? ['lcov'] : ['text', 'html']
    }
  }
})
```

### 3. Conditional Dependencies
```typescript
// Only include framework-specific deps when needed
const testDeps = []
if (isVueProject) testDeps.push('@vue/test-utils')
if (isReactProject) testDeps.push('react', 'react-dom')

export default defineConfig({
  test: {
    deps: { inline: testDeps }
  }
})
```

### 4. Performance Optimization
```typescript
// Faster tests in CI
const isCI = process.env.CI === 'true'

export default defineConfig({
  test: {
    pool: isCI ? 'forks' : 'threads', // Forks can be faster in CI
    poolOptions: {
      forks: {
        singleFork: isCI // Single process in CI for consistency
      }
    }
  }
})
```

## Troubleshooting Checklist

- [ ] Vitest version compatible with Vite version
- [ ] Environment properly set (jsdom for DOM tests)
- [ ] Aliases match between Vite and Vitest config
- [ ] TypeScript types include vitest/globals
- [ ] Problematic dependencies are inlined
- [ ] CSS/assets are properly handled
- [ ] Environment variables are correctly set
- [ ] Framework-specific plugins are configured

---

For the most up-to-date configuration options, always refer to the official [Vitest documentation](https://vitest.dev/config/).