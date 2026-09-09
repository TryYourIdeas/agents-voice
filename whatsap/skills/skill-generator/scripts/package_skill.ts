#!/usr/bin/env npx tsx
/**
 * Skill Packager — Creates a distributable .skill file from a skill folder.
 * The .skill format is a ZIP archive containing the skill directory.
 *
 * Usage:
 *   npx tsx scripts/package-skill.ts <path/to/skill-folder> [output-directory]
 */

import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
  mkdirSync,
} from "fs";
import { resolve, join, relative, basename } from "path";
import { validateSkill } from "./quick-validate.js";

// ── Exclusions ─────────────────────────────────────────────────────────────

const EXCLUDE_DIRS = new Set(["__pycache__", "node_modules", ".git"]);
const EXCLUDE_GLOBS = [/\.pyc$/, /\.js\.map$/];
const EXCLUDE_FILES = new Set([".DS_Store", "Thumbs.db"]);
const ROOT_EXCLUDE_DIRS = new Set(["evals"]);

function shouldExclude(relPath: string): boolean {
  const parts = relPath.split("/");
  for (const part of parts) {
    if (EXCLUDE_DIRS.has(part)) return true;
  }
  if (parts.length >= 1 && ROOT_EXCLUDE_DIRS.has(parts[0])) return true;
  const fileName = parts[parts.length - 1];
  if (EXCLUDE_FILES.has(fileName)) return true;
  if (EXCLUDE_GLOBS.some((re) => re.test(fileName))) return true;
  return false;
}

function collectFiles(dir: string, base: string = dir): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const relPath = relative(base, fullPath);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...collectFiles(fullPath, base));
    } else if (stat.isFile() && !shouldExclude(relPath)) {
      results.push(relPath);
    }
  }
  return results;
}

// ── Minimal ZIP implementation ─────────────────────────────────────────────

let _crc32Table: Uint32Array | null = null;
function getCrc32Table(): Uint32Array {
  if (_crc32Table) return _crc32Table;
  _crc32Table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    _crc32Table[i] = c;
  }
  return _crc32Table;
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  const table = getCrc32Table();
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createZip(
  skillPath: string,
  skillName: string,
  files: string[],
  outputPath: string
): void {
  const localHeaders: Buffer[] = [];
  const centralHeaders: Buffer[] = [];
  let offset = 0;

  for (const relFile of files) {
    const fullPath = join(skillPath, relFile);
    const arcName = `${skillName}/${relFile}`;
    const data = readFileSync(fullPath);
    const arcNameBuf = Buffer.from(arcName, "utf-8");
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(arcNameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    localHeaders.push(Buffer.concat([local, arcNameBuf, data]));

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(arcNameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralHeaders.push(Buffer.concat([central, arcNameBuf]));

    offset += 30 + arcNameBuf.length + data.length;
  }

  const centralDirSize = centralHeaders.reduce((s, b) => s + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDirSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  writeFileSync(
    outputPath,
    Buffer.concat([...localHeaders, ...centralHeaders, eocd])
  );
}

// ── Public API ─────────────────────────────────────────────────────────────

export function packageSkill(
  skillPath: string,
  outputDir?: string
): string | null {
  skillPath = resolve(skillPath);

  if (!existsSync(skillPath) || !statSync(skillPath).isDirectory()) {
    console.error(`Error: Not a valid directory: ${skillPath}`);
    return null;
  }
  if (!existsSync(join(skillPath, "SKILL.md"))) {
    console.error(`Error: SKILL.md not found in ${skillPath}`);
    return null;
  }

  console.log("Validating skill...");
  const { valid, message } = validateSkill(skillPath);
  if (!valid) {
    console.error(`Validation failed: ${message}`);
    return null;
  }
  console.log(`${message}\n`);

  const skillName = basename(skillPath);
  const outDir = outputDir ? resolve(outputDir) : process.cwd();
  mkdirSync(outDir, { recursive: true });
  const outputFile = join(outDir, `${skillName}.skill`);

  const files = collectFiles(skillPath);
  console.log(`Packaging ${files.length} files...`);
  for (const f of files) console.log(`  Added: ${skillName}/${f}`);

  try {
    createZip(skillPath, skillName, files, outputFile);
    console.log(`\nSuccessfully packaged skill to: ${outputFile}`);
    return outputFile;
  } catch (err) {
    console.error(`Error creating .skill file: ${err}`);
    return null;
  }
}

// CLI
if (process.argv[1]?.includes("package-skill")) {
  const skillPath = process.argv[2];
  if (!skillPath) {
    console.error(
      "Usage: npx tsx scripts/package-skill.ts <path/to/skill-folder> [output-directory]"
    );
    process.exit(1);
  }
  console.log(`Packaging skill: ${skillPath}\n`);
  const result = packageSkill(skillPath, process.argv[3]);
  process.exit(result ? 0 : 1);
}
