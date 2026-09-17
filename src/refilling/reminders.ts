import {
  REFILL_CHECK_DAYS,
  REFILL_OVERDUE_DAYS,
  REMINDER_HOUR,
} from "../config/tunables";

// When a batch's two nudges fall due (spec Part C §4 §8).
//
// Pure and separate from `src/lib/reminders.ts` for the same reason the debt
// rules are: `expo-notifications` only exists on a device, so anything that
// imports it cannot be run by `npm test`. The decision of WHEN to fire is the
// part worth testing; the act of handing a date to the OS is not.

export interface RefillNudge {
  kind: "check" | "overdue";
  at: Date;
}

function atHour(base: Date, addDays: number, hour: number): Date {
  const at = new Date(base);
  at.setDate(at.getDate() + addDays);
  at.setHours(hour, 0, 0, 0);
  return at;
}

/**
 * The day-3 check and the day-7 overdue nudge for a batch, dropping any that
 * have already passed.
 *
 * A fixed morning hour, not "72 hours to the minute": a batch that left at
 * 4pm should not ring at 4pm three days later, in the middle of the evening
 * rush. She reads these over morning tea, same as the debt reminders.
 *
 * Note what is NOT here: nothing about how much of the batch has come back.
 * The spec is explicit that a partial return neither cancels nor resets the
 * reminder — it keeps nudging on what REMAINS until the batch is fully back,
 * mirroring the debt rule that a part payment does not buy more time. The
 * caller decides whether a batch still has cylinders out; this function only
 * decides when to speak.
 */
export function refillNudges(
  sentAt: string | Date,
  now: Date = new Date(),
  hour: number = REMINDER_HOUR
): RefillNudge[] {
  const sent = typeof sentAt === "string" ? new Date(sentAt) : sentAt;
  if (Number.isNaN(sent.getTime())) return [];

  return [
    { kind: "check" as const, at: atHour(sent, REFILL_CHECK_DAYS, hour) },
    { kind: "overdue" as const, at: atHour(sent, REFILL_OVERDUE_DAYS, hour) },
  ].filter((nudge) => nudge.at > now);
}

/** What a nudge says. Kept beside the timing so the two stay consistent. */
export function refillNudgeCopy(args: {
  kind: "check" | "overdue";
  companyName: string;
  batchCode: string;
  stillOut: number;
}): { title: string; body: string } {
  const cylinders = `${args.stillOut} ${args.stillOut === 1 ? "cylinder" : "cylinders"}`;
  return args.kind === "check"
    ? {
        title: `Check on ${args.companyName}`,
        body: `${cylinders} still out on batch ${args.batchCode}.`,
      }
    : {
        title: `${args.companyName} is overdue`,
        body: `Batch ${args.batchCode}: ${cylinders} still not back.`,
      };
}
