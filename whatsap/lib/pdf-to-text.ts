// Extracts text from a PDF with poppler's `pdftotext` (installed in the Docker image; see Dockerfile).
// fetch_url used to return the raw PDF bytes ("%PDF-1.7 ...") for catalogues and datasheets, which the model
// could not read - it then downloaded the file and looped trying to find a converter that was not installed.
import { execFile } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export async function pdfToText(data: Uint8Array): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "pdf-"));
  const file = path.join(dir, "in.pdf");
  try {
    await writeFile(file, data);
    return await new Promise<string>((resolve, reject) => {
      execFile("pdftotext", ["-layout", "-enc", "UTF-8", file, "-"], { maxBuffer: 64 * 1024 * 1024, timeout: 60_000 }, (err, stdout) => {
        if (err) reject((err as any).code === "ENOENT" ? new Error("pdftotext (poppler-utils) is not installed") : err);
        else resolve(stdout);
      });
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
