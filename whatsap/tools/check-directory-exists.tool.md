# Check Directory Exists Tool

## Overview
This tool allows an agent to check whether a directory exists in the local file system.

## Purpose
The `check-directory-exists.tool.js` file implements a LangChain tool that enables AI agents to verify if a directory exists on the local system. This is useful for:
- Validating directory paths before writing files
- Conditional logic based on directory existence
- Error prevention when attempting to access non-existent directories

## Implementation Details

### Structure
The tool follows the same pattern as `read-file.tool.js`, `write-file.tool.js`, and `create-directory.tool.js`:
- Uses `langchain` for tool creation
- Uses `zod` for schema validation
- Uses Node.js `fs/promises` for file system operations

### Parameters
The tool accepts a single parameter:
- `directoryPath` (string): The path of the directory to check relative to the current directory

### Behavior
1. Takes the directory path as input
2. Constructs the full path by prepending `./`
3. Uses `fs.stat()` to retrieve file system statistics
4. Checks if the path is a directory using `stats.isDirectory()`
5. Handles the `ENOENT` error (file not found) gracefully
6. Logs the operation for debugging
7. Returns a clear message indicating whether the directory exists

### Return Values
- If directory exists: `{directoryPath} is a directory (exists: true)`
- If directory does not exist: `{directoryPath} is not a directory (does not exist)`
- If there's an error other than "not found": rethrows the error

### Error Handling
The tool specifically handles:
- `ENOENT` (Error NO ENTry): Directory does not exist - returns a clear message instead of throwing
- Other errors (permissions, invalid paths, etc.): rethrown for the agent to handle

### Usage Example
```javascript
import { createCheckDirectoryExistsTool } from "./tools/check-directory-exists.tool.js";
import llm from "your-llm-instance";

const checkDirTool = createCheckDirectoryExistsTool(llm);

// Usage in agent workflow
const result = await checkDirTool({ directoryPath: "my-dir" });
// Result: "my-dir is a directory (exists: true)" or "my-dir is not a directory (does not exist)"
```

### Comparison with create-directory.tool.js
- `create-directory.tool.js`: Creates a directory (with `recursive: true`)
- `check-directory-exists.tool.js`: Checks if a directory exists without creating it

These tools can be used together in a workflow:
```javascript
const exists = await checkDirTool({ directoryPath: "my-dir" });
if (!exists) {
  await createDirTool({ directoryPath: "my-dir" });
}
```

### Security Considerations
- The tool reads file system metadata but doesn't modify anything
- No permission issues expected from the agent's perspective
- Ensure validation of directory paths in production to prevent path traversal
- The tool is read-only, making it safer than creation/deletion tools

## Dependencies
- `langchain` - For tool creation and agent integration
- `zod` - For schema validation
- Node.js built-in `fs/promises` - For file system operations