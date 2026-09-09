#!/bin/bash

# Setup Vitest for a Vite project with Testing Library support
# This script installs Vitest and creates basic configuration files

set -e

echo "Setting up Vitest for Vite project with Testing Library support..."

# Check if package.json exists
if [ ! -f "package.json" ]; then
  echo "Error: No package.json found. Run this script in your Vite project root."
  exit 1
fi

# Install Vitest and related dependencies
echo "Installing Vitest dependencies..."
npm install -D vitest @vitest/ui jsdom

# Detect framework (Vue, React, Svelte, or vanilla)
FRAMEWORK="vanilla"
if grep -q "vue" package.json; then
  FRAMEWORK="vue"
  npm install -D @testing-library/vue @testing-library/user-event
elif grep -q "react" package.json; then
  FRAMEWORK="react"
  npm install -D @testing-library/react @testing-library/user-event
elif grep -q "svelte" package.json; then
  FRAMEWORK="svelte"
  npm install -D @testing-library/svelte @testing-library/user-event
fi

echo "Detected framework: $FRAMEWORK"

# Create test directory structure
mkdir -p src/test

# Create basic test setup file
cat > src/test/setup.ts << EOF
// Test setup file
// Add global test configurations here

// For DOM testing with Testing Library
import { vi } from 'vitest'

// Mock global variables if needed
// vi.stubGlobal('process', {
//   env: {
//     ...process.env,
//     VITE_API_URL: 'http://localhost:3000'
//   }
// })

// Optional: Global Testing Library cleanup
// afterEach(() => {
//   cleanup()
// })
EOF

# Update package.json scripts
node << EOF
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

if (!pkg.scripts) pkg.scripts = {};

pkg.scripts.test = "vitest";
pkg.scripts["test:ui"] = "vitest --ui";
pkg.scripts["test:run"] = "vitest run";
pkg.scripts["test:coverage"] = "vitest run --coverage";

fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
EOF

# Create basic vitest.config.ts if it doesn't exist
if [ ! -f "vitest.config.ts" ] && [ ! -f "vite.config.ts" ]; then
  if [ "$FRAMEWORK" = "vue" ]; then
    INLINE_DEPS="inline: ['@vue/test-utils']"
  elif [ "$FRAMEWORK" = "react" ]; then
    INLINE_DEPS="inline: ['react', 'react-dom']"
  elif [ "$FRAMEWORK" = "svelte" ]; then
    INLINE_DEPS="inline: ['svelte']"
  else
    INLINE_DEPS=""
  fi

  cat > vitest.config.ts << EOF
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    deps: {
      $INLINE_DEPS
    },
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', 'src/test/']
    }
  },
})
EOF
fi

# Create example test file with Testing Library pattern
mkdir -p src/__tests__
if [ "$FRAMEWORK" = "react" ]; then
  cat > src/__tests__/example.test.tsx << EOF
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Example component
const Button = ({ onClick, children }) => (
  <button onClick={onClick}>{children}</button>
)

describe('Example Component Test', () => {
  it('renders correctly', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByText('Click me')).toBeInTheDocument()
  })

  it('handles click events', async () => {
    const user = userEvent.setup()
    const handleClick = vi.fn()
    
    render(<Button onClick={handleClick}>Click me</Button>)
    await user.click(screen.getByText('Click me'))
    
    expect(handleClick).toHaveBeenCalledTimes(1)
  })
})
EOF
elif [ "$FRAMEWORK" = "vue" ]; then
  cat > src/__tests__/example.test.ts << EOF
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'

// Example component
const Button = {
  template: '<button @click="onClick"><slot /></button>',
  props: ['onClick']
}

describe('Example Component Test', () => {
  it('renders correctly', () => {
    render(Button, {
      slots: { default: 'Click me' }
    })
    expect(screen.getByText('Click me')).toBeInTheDocument()
  })

  it('handles click events', async () => {
    const user = userEvent.setup()
    const handleClick = vi.fn()
    
    render(Button, {
      props: { onClick: handleClick },
      slots: { default: 'Click me' }
    })
    await user.click(screen.getByText('Click me'))
    
    expect(handleClick).toHaveBeenCalledTimes(1)
  })
})
EOF
elif [ "$FRAMEWORK" = "svelte" ]; then
  cat > src/__tests__/example.test.ts << EOF
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'

// Example component (you'll need to create this .svelte file)
// const Button = require('./Button.svelte').default

describe('Example Component Test', () => {
  it('renders correctly', () => {
    // render(Button, { props: { text: 'Click me' } })
    // expect(screen.getByText('Click me')).toBeInTheDocument()
  })

  it('handles click events', async () => {
    // const user = userEvent.setup()
    // const handleClick = vi.fn()
    // render(Button, { props: { text: 'Click me', onClick: handleClick } })
    // await user.click(screen.getByText('Click me'))
    // expect(handleClick).toHaveBeenCalledTimes(1)
  })
})
EOF
else
  cat > src/__tests__/example.test.ts << EOF
import { describe, it, expect } from 'vitest'

describe('Example Test', () => {
  it('should work', () => {
    expect(1 + 1).toBe(2)
  })
})
EOF
fi

echo "Vitest setup complete with Testing Library support!"
echo ""
echo "Next steps:"
echo "1. Review the generated files and adjust as needed"
echo "2. Run 'npm test' to start Vitest in watch mode"
echo "3. Run 'npm run test:ui' to open the Vitest UI"
echo "4. Add more tests in src/__tests__ or alongside your source files"
echo "5. Refer to Testing Library documentation for your framework for advanced patterns"