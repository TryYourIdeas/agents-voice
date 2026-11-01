// scheduler.ts
//
// Polls every device's devices/<device>/tasks/ every SCHEDULER_POLL_INTERVAL_MS
// and fires anything due, independently per device — one device's
// stuck/erroring task never blocks another device's. Started from index.ts
// once devices are booted (needs each device's own client for chat-name
// resolution and delivery — see resolveChatIdByName/fireTask below).

import { CronExpressionParser } from "cron-parser";
import { describeNow } from "./lib/datetime.ts";
import { RECURSION_LIMIT_REPLY, scheduledRecursionLimit } from "./util.ts";
import { callAgent, callNamedAgent } from "./agent.ts";
import { sendAgentResponse } from "./lib/send-agent-response.ts";
import { recordMessageOwner, shortIdOf } from "./lib/message-owners.ts";
import { listActiveTaskNames, tryReadTask, updateLastRun, archiveTask, readTaskMemory, type ScheduledTask } from "./lib/tasks.ts";

const POLL_INTERVAL_MS = process.env.SCHEDULER_POLL_INTERVAL_MS
    ? Number(process.env.SCHEDULER_POLL_INTERVAL_MS)
    : 60000;

// Guards against a slow agent call overlapping the next tick, per device —
// a Set instead of a single boolean since devices poll independently.
const pollingDevices = new Set<string>();

// A run that hits the agent's recursion limit produced nothing useful. It must
// not count as a successful run (that silently skipped the day's work), but an
// every-minute retry would burn model/search calls on a task that is stuck. So:
// retry with a backoff a few times, then give up until the next schedule.
export const MAX_STUCK_ATTEMPTS = 2;
export const STUCK_RETRY_DELAY_MS = 10 * 60_000;
const stuckRuns = new Map<string, { attempts: number; retryAt: number }>();
const stuckKey = (device: string, task: string) => `${device}:${task}`;

export function isStuckResponse(response: string): boolean {
    return response === RECURSION_LIMIT_REPLY;
}

// Returns true when the run should be treated as finished (give up now).
export function recordStuckRun(device: string, task: string, now = Date.now()): boolean {
    const key = stuckKey(device, task);
    const attempts = (stuckRuns.get(key)?.attempts ?? 0) + 1;
    if (attempts >= MAX_STUCK_ATTEMPTS) {
        stuckRuns.delete(key);
        return true;
    }
    stuckRuns.set(key, { attempts, retryAt: now + STUCK_RETRY_DELAY_MS });
    return false;
}

export function isStuckBackoff(device: string, task: string, now = Date.now()): boolean {
    const entry = stuckRuns.get(stuckKey(device, task));
    return !!entry && now < entry.retryAt;
}

export function stuckAttempts(device: string, task: string): number {
    return stuckRuns.get(stuckKey(device, task))?.attempts ?? 0;
}

export function clearStuckRun(device: string, task: string): void {
    stuckRuns.delete(stuckKey(device, task));
}

export interface DeviceHandle {
    name: string;
    client: any;
}

// `devices` is read fresh on every tick (via .forEach on whatever array is
// passed in) — index.ts mutates this same array in place as new devices
// come online via the onboarding poller, so newly added devices are picked
// up automatically without restarting this interval.
export function startScheduler(devices: DeviceHandle[]): void {
    console.log(`[scheduler] started, polling every ${POLL_INTERVAL_MS}ms`);
    setInterval(() => {
        devices.forEach((d) => void pollOnce(d.name, d.client));
    }, POLL_INTERVAL_MS);
}

// A client whose Chromium failed to launch (client.initialize() rejected, see
// bot.ts) has pupPage === null; firing a task against it would throw
// "Cannot read properties of null (reading 'evaluate')" every poll. Skipping
// leaves tasks untouched, so they fire as soon as the device is back.
export function isClientReady(client: any): boolean {
    return !!client?.pupPage;
}

async function pollOnce(deviceName: string, client: any): Promise<void> {
    if (!isClientReady(client)) return;
    if (pollingDevices.has(deviceName)) return;
    pollingDevices.add(deviceName);
    try {
        for (const name of listActiveTaskNames(deviceName)) {
            const task = tryReadTask(deviceName, name);
            if (!task || task.status !== "active") continue;
            try {
                if (isDue(task) && !isStuckBackoff(deviceName, task.name)) {
                    console.log(`[scheduler] [${deviceName}] firing task '${task.name}'`);
                    await fireTask(deviceName, client, task);
                }
            } catch (err) {
                // Left last-run/location untouched on purpose — retried
                // next poll, no dead-letter mechanism.
                console.error(`[scheduler] [${deviceName}] task '${task.name}' failed:`, err);
            }
        }
    } finally {
        pollingDevices.delete(deviceName);
    }
}

export function isDue(task: ScheduledTask): boolean {
    const now = new Date();
    if (task.scheduleType === "once") {
        return now >= new Date(task.schedule);
    }
    const prev = CronExpressionParser.parse(task.schedule, { tz: task.timezone, currentDate: now }).prev().toDate();
    if (!task.lastRun) return prev <= now;
    return prev > new Date(task.lastRun);
}

// Wraps a recurring task's body with its prior continuity notes (if any)
// and a write-back instruction, so the agent has explicit, curated context
// instead of relying on conversation history that no longer persists across
// firings (see fireTask's threadId below). One-off tasks never call this —
// they have no continuity concept at all.
export const RESUME_NOTE =
    `NOTE: an earlier attempt at this same run ran out of steps, possibly after saving some of its output. ` +
    `First list the output folder for today's files. Finish only what is missing — do not redo, re-read or ` +
    `re-verify what is already saved — then send the summary and stop.\n\n`;

export function buildRecurringPrompt(
    task: ScheduledTask,
    priorNotes: string | undefined,
    now: Date = new Date(),
    resuming = false
): string {
    // Relative to the device's own directory, not the app root — my_write_file
    // (see lib/device-scoped-path.ts) auto-prefixes with devices/<device>/,
    // so the agent-facing path here must NOT include that prefix itself.
    const memoryPath = `tasks/memory/${task.name}.md`;
    // The agent has no clock; stating "today" up front stops it anchoring on
    // dates in its notes and re-researching old topics (the AI-news loop).
    const d = describeNow(now, task.timezone);
    const header =
        `Today is ${d.weekday}, ${d.date} (${d.timeZone}, now ${d.time.slice(0, 5)}). This run is for ${d.date}.\n\n` +
        (resuming ? RESUME_NOTE : "");
    if (priorNotes) {
        return (
            `${header}## Notes from previous runs\n\n${priorNotes}\n\n---\n\n` +
            `The notes above record what EARLIER runs already covered. They are not today's facts: do not re-search or ` +
            `re-verify them. Look for stories published today or in the last 24 hours and skip anything already covered.\n\n` +
            `## This run's task\n\n${task.body}\n\n` +
            `Do the work with a small number of searches, then write the results and finish. Never repeat a search ` +
            `you already ran. If a page fails to load (403/404), skip that item — do not retry it. Once the files, ` +
            `index and notes are written, send the summary and stop: do not re-list or re-read files to verify them. ` +
            `If anything from this run is worth remembering next time, update your notes using the ` +
            `write_file tool at ${memoryPath} — keep it concise (distilled notes: topics and URLs already covered, not ` +
            `findings), and overwrite rather than append.`
        );
    }
    return (
        `${header}${task.body}\n\nThis is the first run of this recurring task. If continuity across future runs would ` +
        `help (e.g. tracking progress, avoiding repeats), create ${memoryPath} with concise notes using the ` +
        `write_file tool, and keep it updated on future runs.`
    );
}

// Tolerant of a missing/extra leading "@" and case differences — a
// destination-chat value typed or generated by an LLM (see
// tools/create-scheduled-task.tool.ts) commonly drops the "@" a display
// name like "@jlabrada71" starts with (it reads as an @-mention), and an
// exact-match comparison would otherwise silently fail delivery.
function normalizeChatName(name: string): string {
    return name.trim().replace(/^@/, "").toLowerCase();
}

async function resolveChatIdByName(client: any, name: string): Promise<string | undefined> {
    // Same window.require('WAWebCollections').Chat.getModelsArray()
    // approach bot.ts's "list channels" command uses, reversed: name -> id
    // instead of id -> name.
    const chats: { name: string; id: string }[] = await client.pupPage!.evaluate(() => {
        // @ts-ignore - window.require is whatsapp-web.js's own webpack
        // module loader, injected into the page, not typed. The global
        // window.Store shim was dropped as of whatsapp-web.js@1.34.7.
        return window.require('WAWebCollections').Chat.getModelsArray().map((chat: any) => ({
            name: chat.isGroup ? `${chat.formattedTitle || chat.name} (group)` : chat.formattedTitle || chat.name || chat.id.user,
            id: chat.id._serialized,
        }));
    });
    const target = normalizeChatName(name);
    return chats.find((c) => normalizeChatName(c.name) === target)?.id;
}

async function fireTask(deviceName: string, client: any, task: ScheduledTask): Promise<void> {
    const chatId = await resolveChatIdByName(client, task.destinationChat);
    if (!chatId) {
        throw new Error(`destination chat '${task.destinationChat}' not found`);
    }

    // A fresh, unique local thread id every single firing — never reused
    // across runs of the same task (agent.ts/named-agents.ts wrap this in
    // the device: prefix internally). This is the actual fix for the
    // exceed_context_size_error crash: a fixed id let raw tool-call history
    // accumulate forever across firings. Continuity a recurring task needs
    // comes from the explicit tasks/memory/ file instead.
    const localThreadId = `scheduled:${task.name}:${Date.now()}`;

    const body =
        task.scheduleType === "recurring" ? buildRecurringPrompt(task, readTaskMemory(deviceName, task.name), new Date(), stuckAttempts(deviceName, task.name) > 0)
            : task.body;

    const response =
        task.targetAgent === "default"
            ? await callAgent(deviceName, body, localThreadId, { recursionLimit: scheduledRecursionLimit() })
            : await callNamedAgent(deviceName, task.targetAgent, body, localThreadId, { recursionLimit: scheduledRecursionLimit() });

    if (isStuckResponse(response)) {
        const giveUp = recordStuckRun(deviceName, task.name);
        console.error(
            `[scheduler] [${deviceName}] task '${task.name}' hit the agent recursion limit without finishing ` +
                `(${giveUp ? "giving up until next schedule" : `retrying in ${STUCK_RETRY_DELAY_MS / 60_000} min`})`
        );
        if (!giveUp) return; // lastRun untouched => still due; backoff gates the retry
        await sendAgentResponse(
            client,
            chatId,
            `Scheduled task '${task.name}' did not finish after ${MAX_STUCK_ATTEMPTS} attempts: the agent kept looping on ` +
                `tool calls without replying. Some of its output may already be saved. It will run again at its next scheduled time.`
        );
        if (task.scheduleType === "once") archiveTask(deviceName, task.name, "failed");
        else updateLastRun(deviceName, task.name, new Date().toISOString());
        return;
    }
    clearStuckRun(deviceName, task.name);

    // Remember which agent wrote the message so a reply to it (say, the user's
    // story in answer to the daily story prompt) is routed back to that agent.
    const owner = task.targetAgent === "default" ? undefined : task.targetAgent;
    await sendAgentResponse(client, chatId, response, {
        onSent: owner ? (sent) => { const id = shortIdOf(sent); if (id) recordMessageOwner(deviceName, id, owner); } : undefined,
    });

    if (task.scheduleType === "once") {
        archiveTask(deviceName, task.name, "completed");
    } else {
        updateLastRun(deviceName, task.name, new Date().toISOString());
    }
}
