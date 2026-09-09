/**
 * Shared utilities for skill-creator scripts.
 */

import { readFileSync } from "fs";
import { join } from "path";

export interface ParsedSkill {
  name: string;
  description: string;
  content: string;
}

/**
 * Parse a SKILL.md file, returning name, description, and full content.
 */
export function parseSkillMd(skillPath: string): ParsedSkill {
  const content = readFileSync(join(skillPath, "SKILL.md"), "utf-8");
  const lines = content.split("\n");

  if (lines[0].trim() !== "---") {
    throw new Error("SKILL.md missing frontmatter (no opening ---)");
  }

  let endIdx: number | null = null;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      endIdx = i;
      break;
    }
  }

  if (endIdx === null) {
    throw new Error("SKILL.md missing frontmatter (no closing ---)");
  }

  let name = "";
  let description = "";
  const frontmatterLines = lines.slice(1, endIdx);

  let i = 0;
  while (i < frontmatterLines.length) {
    const line = frontmatterLines[i];

    if (line.startsWith("name:")) {
      name = line.slice("name:".length).trim().replace(/^["']|["']$/g, "");
    } else if (line.startsWith("description:")) {
      const value = line.slice("description:".length).trim();

      if ([">", "|", ">-", "|-"].includes(value)) {
        const continuationLines: string[] = [];
        i++;
        while (
          i < frontmatterLines.length &&
          (frontmatterLines[i].startsWith("  ") ||
            frontmatterLines[i].startsWith("\t"))
        ) {
          continuationLines.push(frontmatterLines[i].trim());
          i++;
        }
        description = continuationLines.join(" ");
        continue;
      } else {
        description = value.replace(/^["']|["']$/g, "");
      }
    }
    i++;
  }

  return { name, description, content };
}

/**
 * Calculate basic statistics for an array of numbers.
 */
export function calculateStats(values: number[]): {
  mean: number;
  stddev: number;
  min: number;
  max: number;
} {
  if (values.length === 0) {
    return { mean: 0, stddev: 0, min: 0, max: 0 };
  }

  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;

  let stddev = 0;
  if (n > 1) {
    const variance =
      values.reduce((sum, x) => sum + (x - mean) ** 2, 0) / (n - 1);
    stddev = Math.sqrt(variance);
  }

  return {
    mean: Math.round(mean * 10000) / 10000,
    stddev: Math.round(stddev * 10000) / 10000,
    min: Math.round(Math.min(...values) * 10000) / 10000,
    max: Math.round(Math.max(...values) * 10000) / 10000,
  };
}
