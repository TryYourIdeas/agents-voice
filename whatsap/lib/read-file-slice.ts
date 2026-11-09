// lib/read-file-slice.ts
//
// Bounded file reads for the my_read_file tool. A tool result goes straight into
// the model's context, so reading a huge file whole (e.g. logs.txt at ~25 MB)
// overflows it and the whole request fails. Reads at most `maxBytes` from
// `offset` and appends a notice telling the model how to page on.

import fs from "node:fs/promises";

export const DEFAULT_READ_MAX_BYTES = Number(process.env.READ_FILE_MAX_BYTES) || 20_000;

export async function readFileSlice(
    fullPath: string,
    offset = 0,
    maxBytes: number = DEFAULT_READ_MAX_BYTES,
): Promise<string> {
    const start = Math.max(0, Math.floor(offset));
    const handle = await fs.open(fullPath, "r");
    try {
        const { size } = await handle.stat();
        if (start >= size && size > 0) {
            return `[offset ${start} is past the end of the file (${size} bytes)]`;
        }
        const length = Math.min(maxBytes, Math.max(0, size - start));
        const buffer = Buffer.alloc(length);
        const { bytesRead } = await handle.read(buffer, 0, length, start);
        const text = buffer.subarray(0, bytesRead).toString("utf-8");
        const end = start + bytesRead;
        if (end >= size) return text;
        return `${text}\n\n[truncated: showed bytes ${start}-${end} of ${size}. Call my_read_file again with offset=${end} to continue, or use execute_bash (grep/tail) to search the file instead of reading it all.]`;
    } finally {
        await handle.close();
    }
}
