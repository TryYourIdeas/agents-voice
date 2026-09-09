# Create Directory Tool

## Overview
This tool allows an agent to create directories in the local file system.

## Purpose
The `create_directory.tool.js` file implements a LangChain tool that enables AI agents to create directories on the local system. This is useful for organizing files, setting up project structures, or preparing the environment for subsequent operations.

## Implementation Details

### Structure
The tool follows the same pattern as `read-file.tool.js` and `write-file.tool.js`:
- Uses `langchain` for tool creation
- Uses `zod` for schema validation
- Uses Node.js `fs/promises` for file system operations

### Parameters
The tool accepts a single parameter:
- `directoryPath` (string): The path of the directory to create relative to the current directory

### Behavior
1. Takes the directory path as input
2. Uses `fs.mkdir()` with the `recursive: true` option to create the directory
3. The `recursive: true` option ensures that if any parent directories don't exist, they are also created
4. Logs the operation for debugging
5. Returns a success message with the directory path

### Error Handling
The tool relies on Node.js's built-in error handling. If the directory path is invalid or permission issues occur, an error will be thrown by `fs.mkdir()`.

### Usage Example
```javascript
import { createCreateDirectoryTool } from "./tools/create-directory.tool.js";
import llm from "your-llm-instance";

const createDirTool = createCreateDirectoryTool(llm);
```

### Security Considerations
- The tool creates directories relative to the current working directory
- Ensure the agent has appropriate permissions to write to the target locations
- Validate directory paths before use in production environments to prevent path traversal attacks

## Dependencies
- `langchain` - For tool creation and agent integration
- `zod` - For schema validation
- Node.js built-in `fs/promises` - For file system operations