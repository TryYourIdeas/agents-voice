# List Directory Tool

## Overview
This tool lists all files in a given directory, excluding subdirectories.

## Description
The `list-directory.tools.ts` file provides a function that:
- Takes a directory path as input
- Validates that the path exists and is a directory
- Returns an array of all file names (not subdirectories) in the directory
- Returns the files sorted alphabetically

## Function Signature
```typescript
export function listDirectory(directoryPath: string): string[]
```

## Parameters
- `directoryPath` (string): The path to the directory whose files you want to list

## Returns
- An array of file names (strings) found in the directory, sorted alphabetically

## Error Handling
The function throws errors for:
1. Empty directory path
2. Non-existent directory path
3. Path that is not a directory

## Usage Examples

### Command Line Usage
```bash
# List files in current directory
node ./tools/list-directory.tools.ts

# List files in a specific directory
node ./tools/list-directory.tools.ts /path/to/directory
```

### Programmatic Usage
```typescript
import { listDirectory } from './tools/list-directory.tools';

const files = listDirectory('/path/to/directory');
console.log(files);
```

## Implementation Details
1. Uses Node.js `fs` module for file system operations
2. Uses `fs.readdirSync()` to read directory entries
3. Uses `fs.statSync()` to check if each entry is a file or directory
4. Filters out subdirectories and returns only files
5. Sorts the resulting array alphabetically

## Dependencies
- Node.js built-in `fs` module
- Node.js built-in `path` module

## Testing
See `list-directory.spec.ts` for test cases covering:
- Valid directories with files
- Non-existent directories
- Paths that are not directories
- Empty directories
- Directories with only subdirectories
- Directories with mixed files and subdirectories