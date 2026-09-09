#!/usr/bin/env npx tsx
/**
 * Quick validation script for skills — checks SKILL.md frontmatter
 * against the Agent Skills specification.
 *
 * Usage:
 *   npx tsx scripts/quick-validate.ts <skill_directory>
 */

import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";

const ALLOWED_PROPERTIES = new Set([
  "name",
  "description",
  "license",
  "allowed-tools",
  "metadata",
  "compatibility",
]);

export function validateSkill(
  skillPath: string
): { valid: boolean; message: string } {
  skillPath = resolve(skillPath);

  const skillMd = join(skillPath, "SKILL.md");
  if (!existsSync(skillMd)) {
    return { valid: false, message: "SKILL.md not found" };
  }

  const content = readFileSync(skillMd, "utf-8");
  if (!content.startsWith("---")) {
    return { valid: false, message: "No YAML frontmatter found" };
  }

  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    return { valid: false, message: "Invalid frontmatter format" };
  }

  const frontmatterText = match[1];
  const topLevelKeys: string[] = [];
  const keyValues: Record<string, string> = {};

  for (const line of frontmatterText.split("\n")) {
    const keyMatch = line.match(/^([a-z][a-z0-9-]*)\s*:/);
    if (keyMatch) {
      topLevelKeys.push(keyMatch[1]);
      keyValues[keyMatch[1]] = line.slice(keyMatch[0].length).trim();
    }
  }

  const unexpected = topLevelKeys.filter((k) => !ALLOWED_PROPERTIES.has(k));
  if (unexpected.length > 0) {
    return {
      valid: false,
      message: `Unexpected key(s): ${unexpected.join(", ")}. Allowed: ${[...ALLOWED_PROPERTIES].sort().join(", ")}`,
    };
  }

  if (!topLevelKeys.includes("name")) {
    return { valid: false, message: "Missing 'name' in frontmatter" };
  }
  if (!topLevelKeys.includes("description")) {
    return { valid: false, message: "Missing 'description' in frontmatter" };
  }

  const name = keyValues["name"]?.replace(/^["']|["']$/g, "") ?? "";
  if (name) {
    if (!/^[a-z0-9-]+$/.test(name)) {
      return {
        valid: false,
        message: `Name '${name}' should be kebab-case (lowercase letters, digits, and hyphens only)`,
      };
    }
    if (name.startsWith("-") || name.endsWith("-") || name.includes("--")) {
      return {
        valid: false,
        message: `Name '${name}' cannot start/end with hyphen or contain consecutive hyphens`,
      };
    }
    if (name.length > 64) {
      return {
        valid: false,
        message: `Name is too long (${name.length} chars). Max is 64.`,
      };
    }
  }

  const desc = keyValues["description"]?.replace(/^["']|["']$/g, "") ?? "";
  if (desc && ![">", "|", ">-", "|-"].includes(desc)) {
    if (desc.length > 1024) {
      return {
        valid: false,
        message: `Description is too long (${desc.length} chars). Max is 1024.`,
      };
    }
  }

  const compat = keyValues["compatibility"]?.replace(/^["']|["']$/g, "") ?? "";
  if (compat && compat.length > 500) {
    return {
      valid: false,
      message: `Compatibility is too long (${compat.length} chars). Max is 500.`,
    };
  }

  return { valid: true, message: "Skill is valid!" };
}

// CLI
if (process.argv[1]?.includes("quick-validate")) {
  const skillDir = process.argv[2];
  if (!skillDir) {
    console.error("Usage: npx tsx scripts/quick-validate.ts <skill_directory>");
    process.exit(1);
  }
  const { valid, message } = validateSkill(skillDir);
  console.log(message);
  process.exit(valid ? 0 : 1);
}
