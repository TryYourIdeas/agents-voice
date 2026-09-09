---
name: cron-scheduling
description: Cron syntax reference and natural-language-to-cron translation guidance, including timezone handling, for creating scheduled tasks.
---

# Cron Scheduling

Use this when translating a user's natural-language timing request into the
`schedule`/`schedule-type`/`timezone` fields `create_scheduled_task` needs.

## Cron format

Five fields, space-separated: `minute hour day-of-month month day-of-week`.

| Field | Range | Notes |
|---|---|---|
| minute | 0-59 | |
| hour | 0-23 | 24-hour clock |
| day-of-month | 1-31 | |
| month | 1-12 | |
| day-of-week | 0-6 or SUN-SAT | Both 0 and 7 mean Sunday — prefer the three-letter names (MON, TUE, ...) to avoid ambiguity. |

`*` means "every value". Comma-separated lists (`MON,THU`) and ranges (`1-5`)
are both supported.

## Natural language → cron examples

| User said | schedule-type | schedule | Notes |
|---|---|---|---|
| "every day at 9am" | recurring | `0 9 * * *` | |
| "every weekday at 9am" | recurring | `0 9 * * MON-FRI` | |
| "every Monday and Thursday at 9am" | recurring | `0 9 * * MON,THU` | |
| "every hour" | recurring | `0 * * * *` | |
| "on the 1st of every month" | recurring | `0 0 1 * *` | |
| "in 2 hours" | once | ISO datetime = now + 2h | Compute the literal datetime — don't invent a cron expression for a one-off. |
| "tomorrow at 6pm" | once | ISO datetime for that date/time | |

## Timezone

Always set `timezone` explicitly (IANA name, e.g.
`America/Argentina/Buenos_Aires`). Default to the container's local
timezone if the user doesn't name one — don't guess a different timezone
from context (a display name, a phone number) without confirming; if truly
unsure, ask.

## Common pitfalls

- "Morning" / "afternoon" / "evening" are ambiguous — ask for (or confirm) a
  specific hour before creating the task.
- A day-of-week list must use `MON`/`TUE`/... or `0`-`6` consistently — don't
  mix, and remember `0` and `7` both mean Sunday.
- For a one-off task, `schedule` is an ISO datetime, never a cron string —
  don't cron-ify something that only needs to happen once.
