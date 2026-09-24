// Turning a thrown error into something a shopkeeper can read.
//
// Until now the app printed the raw exception on screen. That was a deliberate
// choice with a bad consequence: this APK is sideloaded with no crash
// reporting, so the message really is the only evidence anyone will ever have
// — but the person reading it is standing at a counter with a customer
// waiting, and "the second argument cannot be cast to type
// expo.modules.sqlite.NativeStatement" tells her nothing except that something
// is badly broken.
//
// It is also more than she should see. Internal class names, table names and
// SQL fragments describe how the app is built, and a screen that volunteers
// that to anyone holding the phone is handing out a map. It is a small
// exposure, but it is free to avoid.
//
// So every error now has two readings: a plain sentence for her, and the
// original text kept behind a deliberate tap for whoever is fixing it.

export interface DescribedError {
  /** What she sees. Plain, calm, and never blaming her. */
  friendly: string;
  /** The original text, shown only behind "Technical details". */
  technical: string;
}

function raw(err: unknown): string {
  if (err instanceof Error) {
    return err.stack ? `${err.message}\n\n${err.stack}` : err.message;
  }
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

// Matched on text because the underlying libraries do not give these distinct
// error types. Each phrase maps to a cause a person can actually act on.
const PATTERNS: { test: RegExp; friendly: string }[] = [
  {
    test: /no such table|no such column|syntax error|not an error/i,
    friendly:
      "This phone's records are set up in a way the app did not expect. Nothing has been lost — but this needs Edd to look at it.",
  },
  {
    test: /valid id|NativeStatement|NativeDatabase|shared object/i,
    friendly:
      "The app lost its connection to the records on this phone. Nothing has been lost. Close the app completely and open it again.",
  },
  {
    test: /database is locked|busy/i,
    friendly:
      "The app was busy saving something else. Wait a moment and try again.",
  },
  {
    test: /disk|SQLITE_FULL|no space/i,
    friendly:
      "This phone has run out of storage space. Free some space and try again — nothing has been lost.",
  },
  {
    test: /permission|denied/i,
    friendly:
      "The app was not allowed to do that on this phone. Check its permissions in Android settings.",
  },
  {
    test: /network|timeout|fetch|unreachable/i,
    friendly:
      "This one needed the internet and could not reach it. Everything still works without it — nothing has been lost.",
  },
];

export function describeError(err: unknown): DescribedError {
  const technical = raw(err);
  const match = PATTERNS.find((p) => p.test.test(technical));

  return {
    friendly:
      match?.friendly ??
      // The honest fallback. It says the two things she actually needs: her
      // records are fine, and this is not something she did.
      "Something went wrong inside the app. Nothing has been lost, and this is not something you did wrong.",
    technical,
  };
}
