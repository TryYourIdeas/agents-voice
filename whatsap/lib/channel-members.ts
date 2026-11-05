// lib/channel-members.ts
//
// Pure helpers for "@ai list groups" and "@ai save <channel> members" (see
// bot.ts): command parsing, folder-name sanitising, and members.md rendering.
// The WhatsApp store reads themselves live in bot.ts (they need the live page).

import fs from "node:fs";
import path from "node:path";

export interface ChannelMember {
    name?: string;
    phone: string;
    isAdmin: boolean;
}

// "save Family Group members" -> "Family Group". Anchored at the end, so a
// channel whose own name ends in "members" still works.
export function parseSaveMembersCommand(request: string): string | undefined {
    const match = request.trim().match(/^save\s+([\s\S]+?)\s+members$/i);
    const name = match?.[1]?.trim();
    return name ? name : undefined;
}

// Display name -> filesystem-safe folder name: lowercased, runs of anything
// other than letters/digits/_ become a single "-". Unicode letters are kept.
export function channelDirName(channelName: string): string {
    const cleaned = channelName
        .toLowerCase()
        .replace(/[^\p{L}\p{N}_]+/gu, "-")
        .replace(/^-+|-+$/g, "");
    return cleaned || "channel";
}

export function renderMembersMarkdown(channelName: string, members: ChannelMember[], savedAt: Date): string {
    const lines = [
        `# ${channelName} — members`,
        "",
        `Saved at: ${savedAt.toISOString()}`,
        `Members: ${members.length}`,
        "",
        ...members.map((m) => `- ${m.name ? `${m.name} ` : ""}(+${m.phone})${m.isAdmin ? " — admin" : ""}`),
        "",
    ];
    return lines.join("\n");
}

// Writes devices/<device>/channels/<dir>/members.md and returns that path.
export function saveChannelMembers(
    deviceName: string,
    channelName: string,
    members: ChannelMember[],
    savedAt: Date = new Date(),
    baseDir: string = "devices"
): string {
    const dir = path.join(baseDir, deviceName, "channels", channelDirName(channelName));
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "members.md");
    fs.writeFileSync(file, renderMembersMarkdown(channelName, members, savedAt), "utf-8");
    return file;
}
