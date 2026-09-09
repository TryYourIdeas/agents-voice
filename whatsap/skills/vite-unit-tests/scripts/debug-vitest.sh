#!/bin/bash

# Debug common Vitest and Testing Library issues in Vite projects

set -e

echo "Debugging Vitest and Testing Library setup..."

# Check if package.json exists
if [ ! -f "package.json" ]; then
  echo "Error: No package.json found. Run this script in your Vite project root."
  exit 1
fi

# Check Vitest installation
if ! grep -q "vitest" package.json; then
  echo "Warning: Vitest not found in dependencies"
  echo "Run: npm install -D vitest"
fi

# Check jsdom installation (required for Testing Library)
if ! grep -q "jsdom" package.json; then
  echo "Warning: jsdom not found in dependencies (required for DOM testing)"
  echo "Run: npm install -D jsdom"
fi

# Check for config files
CONFIG_FOUND=false
if [ -f "vitest.config.ts" ]; then
  echo "✓ Found vitest.config.ts"
  CONFIG_FOUND=true
elif [ -f "vitest.config.js" ]; then
  echo "✓ Found vitest.config.js"
  CONFIG_FOUND=true
elif [ -f "vite.config.ts" ]; then
  if grep -q "test" vite.config.ts; then
    echo "✓ Found test configuration in vite.config.ts"
    CONFIG_FOUND=true
  fi
elif [ -f "vite.config.js" ]; then
  if grep -q "test" vite.config.js; then
    echo "✓ Found test configuration in vite.config.js"
    CONFIG_FOUND=true
  fi
fi

if [ "$CONFIG_FOUND" = false ]; then
  echo "Warning: No Vitest configuration found"
  echo "Create vitest.config.ts or add test config to vite.config.ts"
fi

# Check for test directory
if [ -d "src/__tests__" ] || [ -d "__tests__" ] || find . -name "*.test.ts" -o -name "*.test.js" | grep -q .; then
  echo "✓ Found test files or directories"
else
  echo "Warning: No test files found"
  echo "Create tests in src/__tests__ or use *.test.ts naming convention"
fi

# Check TypeScript configuration
if [ -f "tsconfig.json" ]; then
  if grep -q "vitest/globals" tsconfig.json; then
    echo "✓ TypeScript globals configured for Vitest"
  else
    echo "Info: Consider adding vitest/globals to tsconfig.json types"
    echo "Example: {\"compilerOptions\": {\"types\": [\"vitest/globals\"]}}"
  fi
fi

# Check for jsdom if needed
if [ "$CONFIG_FOUND" = true ]; then
  CONFIG_FILE=""
  if [ -f "vitest.config.ts" ]; then
    CONFIG_FILE="vitest.config.ts"
  elif [ -f "vitest.config.js" ]; then
    CONFIG_FILE="vitest.config.js"
  elif [ -f "vite.config.ts" ]; then
    CONFIG_FILE="vite.config.ts"
  elif [ -f "vite.config.js" ]; then
    CONFIG_FILE="vite.config.js"
  fi
  
  if [ -n "$CONFIG_FILE" ]; then
    if grep -q "environment.*jsdom" "$CONFIG_FILE"; then
      if ! grep -q "jsdom" package.json; then
        echo "Warning: jsdom environment configured but jsdom not installed"
        echo "Run: npm install -D jsdom"
      else
        echo "✓ jsdom properly installed for DOM testing"
      fi
    fi
  fi
fi

# Check framework-specific Testing Library dependencies
if grep -q "vue" package.json; then
  if ! grep -q "@testing-library/vue" package.json; then
    echo "Warning: Vue project detected but @testing-library/vue not installed"
    echo "Run: npm install -D @testing-library/vue @testing-library/user-event"
  else
    echo "✓ @testing-library/vue installed"
  fi
fi

if grep -q "react" package.json; then
  if ! grep -q "@testing-library/react" package.json; then
    echo "Warning: React project detected but @testing-library/react not installed"
    echo "Run: npm install -D @testing-library/react @testing-library/user-event"
  else
    echo "✓ @testing-library/react installed"
  fi
fi

if grep -q "svelte" package.json; then
  if ! grep -q "@testing-library/svelte" package.json; then
    echo "Warning: Svelte project detected but @testing-library/svelte not installed"
    echo "Run: npm install -D @testing-library/svelte @testing-library/user-event"
  else
    echo "✓ @testing-library/svelte installed"
  fi
fi

# Check user-event installation
if grep -q "@testing-library/.*" package.json && ! grep -q "@testing-library/user-event" package.json; then
  echo "Info: Consider installing @testing-library/user-event for realistic user interactions"
  echo "Run: npm install -D @testing-library/user-event"
fi

# Check for common Testing Library import patterns in test files
if find . -name "*.test.ts" -o -name "*.test.tsx" -o -name "*.test.js" -o -name "*.test.jsx" | xargs grep -l "@testing-library" 2>/dev/null; then
  echo "✓ Found Testing Library usage in test files"
else
  if grep -q "@testing-library" package.json; then
    echo "Info: Testing Library installed but not yet used in test files"
    echo "Check the skill documentation for Testing Library examples"
  fi
fi

echo ""
echo "Debug complete. Address any warnings above."
echo "For Testing Library best practices, refer to the updated skill documentation."