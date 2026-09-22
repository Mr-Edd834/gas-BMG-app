import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { REMINDER_HOUR, DEBT_DEADLINE_DAYS } from "../config/tunables";
import { deadlineFor } from "../debts/rules";
import { listEmptiesDebts, listMoneyDebts } from "../db/queries/debts";
import { getPref } from "../db/queries/settings";
import { listOpenBatches } from "../db/queries/refilling";
import { refillNudgeCopy, refillNudges } from "../refilling/reminders";
import { formatDate } from "./formatDate";
import { formatMoney } from "./formatMoney";

// Local, on-device debt reminders (spec Part C §2 §8).
//
// Local — NOT push. There is no server and no internet requirement: the OS
// holds the schedule and fires it even with the app closed and the phone
// offline, which is the only design that works in a shop with unreliable
// signal. A push-based reminder would go silent exactly when the shop needs
// it most.

// Shown even while the app is open, so a 09:00 reminder is not swallowed just
// because she happens to be mid-sale.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// The Android channel ID stays "debt-reminders" even though refill nudges now
// share it: the ID is what the OS keys a user's own notification settings to,
// so renaming it would silently discard any preference she had already set.
// The label she actually SEES is the `name` below.
const CHANNEL = "debt-reminders";

/**
 * Asks for permission once. Returns false if refused.
 *
 * Refusal is not an error and must never block anything: reminders are a
 * convenience layered on top of a book that works without them (G8).
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync();
  let granted = existing.granted;
  if (!granted && existing.canAskAgain) {
    const asked = await Notifications.requestPermissionsAsync();
    granted = asked.granted;
  }
  if (granted && Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: "Reminders",
      importance: Notifications.AndroidImportance.DEFAULT,
      // No vibration pattern or light: these arrive at 09:00 as a calm nudge,
      // not an alarm. The app's whole tone is informational, never alarming.
      vibrationPattern: [0, 250],
      lockscreenVisibility:
        Notifications.AndroidNotificationVisibility.PRIVATE,
    });
  }
  return granted;
}

// The moment a reminder should fire: a fixed hour on a given day, NOT
// "seven days to the minute from the sale" (spec §8). A debt taken at 4pm
// should not be chased at 4pm a week later — she reads these over morning tea.
function fireAt(base: Date, daysBefore: number, hour: number): Date {
  const at = new Date(base);
  at.setDate(at.getDate() - daysBefore);
  at.setHours(hour, 0, 0, 0);
  return at;
}

// Preference keys, named once so Settings and the scheduler cannot drift.
export const REMINDERS_ENABLED_KEY = "reminders.enabled";
export const REMINDER_HOUR_KEY = "reminders.hour";

/** Reminders are ON until she says otherwise — an unset preference is not off. */
export async function remindersEnabled(): Promise<boolean> {
  return (await getPref(REMINDERS_ENABLED_KEY)) !== "false";
}

export async function reminderHour(): Promise<number> {
  const raw = await getPref(REMINDER_HOUR_KEY);
  const parsed = raw === null ? NaN : Number(raw);
  // A corrupt or out-of-range stored value falls back to the default rather
  // than scheduling everything for hour NaN, which silently schedules nothing.
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 23
    ? parsed
    : REMINDER_HOUR;
}

/**
 * Rebuilds the entire reminder schedule from what is currently outstanding.
 *
 * Deliberately a full resync rather than scheduling and cancelling one debt at
 * a time. Incremental bookkeeping means tracking which notification belongs to
 * which debt and remembering to cancel it on every path that could settle one —
 * a repayment, a correction, a sync from another phone. Miss one path and the
 * shop chases money that was already paid, which is worse than not reminding
 * at all.
 *
 * Rebuilding from current state cannot drift: whatever is owed right now is
 * exactly what is scheduled. It is cheap at this scale (a duka, tens of open
 * debts), and it makes the spec's lifecycle rules fall out for free —
 *   - a cleared debt simply is not in the list any more, so nothing is
 *     scheduled for it (§8, "don't chase settled money"), and
 *   - a partial payment leaves the debt outstanding with a smaller balance, so
 *     it reschedules at the SAME deadline with an updated amount, which is
 *     exactly the required behaviour (§8: partial payment neither cancels nor
 *     resets).
 */
export async function syncReminders(businessId: string): Promise<void> {
  // Settings can switch reminders off entirely, and move the hour they arrive
  // (spec Part C §6 §5). What it deliberately cannot change is the SCHEDULE
  // LOGIC — day-6 and day-7 for a debt, day-3 and day-7 for a batch. Those
  // come from the debt rules, not from a preference, so a reminder can never
  // be quietly tuned into uselessness.
  const enabled = await remindersEnabled();
  if (!enabled) {
    await Notifications.cancelAllScheduledNotificationsAsync();
    return;
  }

  const granted = await ensureNotificationPermission();
  if (!granted) return;

  const hour = await reminderHour();

  await Notifications.cancelAllScheduledNotificationsAsync();

  const now = new Date();
  const [money, empties, openBatches] = await Promise.all([
    listMoneyDebts(businessId),
    listEmptiesDebts(businessId),
    listOpenBatches(businessId),
  ]);

  const jobs: Promise<unknown>[] = [];

  for (const customer of money) {
    for (const debt of customer.debts) {
      const due = deadlineFor(debt.soldAt);
      // Day-6 heads-up, then day-7 on the deadline itself.
      const heads = fireAt(due, 1, hour);
      const onDue = fireAt(due, 0, hour);

      if (heads > now) {
        jobs.push(
          schedule({
            title: `${customer.customerName} owes ${formatMoney(debt.outstanding)} tomorrow`,
            body: `${debt.description} · taken ${formatDate(debt.soldAt)}`,
            date: heads,
            view: "money",
          })
        );
      }
      if (onDue > now) {
        jobs.push(
          schedule({
            title: `${customer.customerName}: ${formatMoney(debt.outstanding)} due today`,
            body: `${debt.description} · taken ${formatDate(debt.soldAt)}`,
            date: onDue,
            view: "money",
          })
        );
      }
    }
  }

  for (const customer of empties) {
    for (const batch of customer.batches) {
      const due = deadlineFor(batch.soldAt);
      const heads = fireAt(due, 1, hour);
      const onDue = fireAt(due, 0, hour);
      const what = `${batch.outstanding} ${batch.outstanding === 1 ? "empty" : "empties"}`;

      if (heads > now) {
        jobs.push(
          schedule({
            title: `${customer.customerName} owes ${what} tomorrow`,
            body: `${batch.brand} · ${batch.size} · taken ${formatDate(batch.soldAt)}`,
            date: heads,
            view: "empties",
          })
        );
      }
      if (onDue > now) {
        jobs.push(
          schedule({
            title: `${customer.customerName}: ${what} due today`,
            body: `${batch.brand} · ${batch.size} · taken ${formatDate(batch.soldAt)}`,
            date: onDue,
            view: "empties",
          })
        );
      }
    }
  }

  // Refill batches (spec Part C §4 §8). `listOpenBatches` only returns batches
  // that still have cylinders out, so the resync rule does the work here too:
  // a batch that came back fully simply is not in the list any more, and a
  // partially returned one is — with a smaller `totalOut`, at the SAME dates.
  // That is exactly the specced behaviour: a partial return neither cancels
  // nor resets the nudge.
  for (const batch of openBatches) {
    for (const nudge of refillNudges(batch.sentAt, now, hour)) {
      const copy = refillNudgeCopy({
        kind: nudge.kind,
        companyName: batch.companyName,
        batchCode: batch.batchCode,
        stillOut: batch.totalOut,
      });
      jobs.push(
        schedule({
          title: copy.title,
          body: copy.body,
          date: nudge.at,
          view: "refill",
        })
      );
    }
  }

  await Promise.all(jobs);
}

async function schedule(input: {
  title: string;
  body: string;
  date: Date;
  view: "money" | "empties" | "refill";
}): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: input.title,
      body: input.body,
      // Read when the notification is tapped, to open the right Debts view.
      data: { view: input.view },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: input.date,
      channelId: CHANNEL,
    },
  });
}

/**
 * Turns every scheduled reminder off.
 *
 * Settings will expose this as a switch (spec Part C §6 §5). The day-6/day-7
 * schedule itself is NOT user-controllable — only whether reminders arrive and
 * at what hour.
 */
export async function cancelAllReminders(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export const REMINDER_SCHEDULE_DESCRIPTION = `A heads-up the day before, and again on the day, at ${REMINDER_HOUR}:00. Each credit sale is due ${DEBT_DEADLINE_DAYS} days after it was taken.`;
