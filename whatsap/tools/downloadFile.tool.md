# Download File Tool

The `download_file` tool allows agents to download files from URLs and save them to the local filesystem.

## Overview

This tool fetches files from web URLs and saves them to specified local paths. It handles:
- Fetching files from HTTP/HTTPS URLs
- Creating destination directories if they don't exist
- Determining file extensions from URLs
- Streaming progress updates during download

## Usage

```typescript
import { createAgent, tool } from "langchain";
import { z } from "zod";
import { createDownloadFileTool } from "./tools/downloadFile.tool";

const downloadFile = createDownloadFileTool(llm);

const agent = createAgent({
  model: new ChatOpenAI({ model: "gpt-4.1" }),
  tools: [downloadFile],
});

// The agent can now use this tool to download files
```

## Parameters

### url (required)
- **Type**: `string`
- **Description**: The URL of the file to download
- **Format**: Must be a valid HTTP or HTTPS URL

### destination_path (required)
- **Type**: `string`
- **Description**: The local path where the file should be saved
- **Format**: Local filesystem path (supports relative and absolute paths)

## Example

```typescript
// Download a file from a URL
const result = await downloadFile.invoke({
  url: "https://example.com/file.pdf",
  destination_path: "./downloads/file.pdf",
});

console.log(result);
// Output: "Successfully downloaded file from https://example.com/file.pdf to ./downloads/file.pdf"
```

## Error Handling

The tool handles common errors:
- Invalid URLs (throws `Error`)
- Network failures (throws `Error`)
- Failed HTTP requests (throws `Error` with status code)

## Streaming Updates

The tool supports streaming progress updates via `config.writer`:

```typescript
const downloadFile = tool(
  async ({ url, destination_path }, config) => {
    const writer = config.writer;
    
    if (writer) {
      writer(`Connecting to URL: ${url}`);
      // ... download logic ...
      writer(`Successfully downloaded file to: ${destination_path}`);
    }
    
    return "Download complete";
  },
  {
    name: "download_file",
    description: "Download a file from a URL...",
    schema: z.object({
      url: z.string().url(),
      destination_path: z.string(),
    }),
  }
);
```

## Notes

- The tool automatically creates parent directories if they don't exist
- File extensions are extracted from the URL for reference
- The tool returns a success message with the download path
- For large files, consider implementing progress tracking