import { vi } from "vitest";
import { execFile } from "node:child_process";

// Shared execFile mock for render.test.ts / validation.test.ts — lets tests
// exercise success, malformed-input, and timeout paths deterministically,
// without needing a real Java + PlantUML install in the test environment.
// The spec's own test plan calls this out explicitly for the timeout case;
// applying it to all render.service outcomes keeps every test fast and
// environment-independent.
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, existsSync: () => true };
});

type Scenario = "svg" | "png" | "error" | "timeout" | "empty";

export function mockExecFile(scenario: Scenario): void {
  vi.mocked(execFile).mockReset();
  // @ts-expect-error - test double doesn't implement the full ChildProcess type
  vi.mocked(execFile).mockImplementation((_file, _args, _options, callback) => {
    const cb = callback as (error: unknown, stdout: Buffer, stderr: Buffer) => void;

    queueMicrotask(() => {
      switch (scenario) {
        case "svg":
          cb(null, Buffer.from("<svg>ok</svg>"), Buffer.alloc(0));
          break;
        case "png":
          cb(null, Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(0));
          break;
        case "error":
          cb(Object.assign(new Error("exit 1"), { code: 1 }), Buffer.alloc(0), Buffer.from("syntax error"));
          break;
        case "timeout":
          cb(Object.assign(new Error("timeout"), { killed: true, signal: "SIGTERM" }), Buffer.alloc(0), Buffer.alloc(0));
          break;
        case "empty":
          cb(null, Buffer.alloc(0), Buffer.alloc(0));
          break;
      }
    });

    return { stdin: { write: vi.fn(), end: vi.fn(), on: vi.fn() } };
  });
}
