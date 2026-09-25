# When a record is wrong

Someone will type 500 instead of 5,000. Someone will record a sale against the
wrong customer. A cylinder count will be off. This is not a hypothetical — it
is a Tuesday.

This is what the app does about it, and why.

---

## The rule

**Nothing in this app is edited. Nothing is deleted. A mistake is corrected by
recording the correction.**

The only exception is a sale's free-text note, which is a memo and feeds no
calculation.

## Why it works that way

Because balances are never stored — they are added up from history every time
you look. What a customer owes *is* the list of what they took minus what they
paid. There is no balance sitting in a column to correct.

So editing history would not be "fixing a number". It would be changing what
the records say happened, and then every figure downstream would silently
change with it, with nothing left to show that it ever said anything else.

There is a second reason, and in a shop with three phones it is the sharper
one. **An edit or a delete is not personal.** If any of the three phones can
remove a record, then a record can disappear and nobody can prove it existed.
The moment that is possible, the notebook stops being able to settle an
argument — which is the whole reason it was replaced by an app.

A record you cannot alter is worth more than a record you can tidy.

---

## What to actually do

### A sale recorded wrong

**Sales Record → find the sale → "Fix this sale".**

The sale opens again with everything she typed already filled in. She changes
what was wrong — the count, the price, whatever — and saves as normal.

The record then shows two entries side by side: the wrong one crossed out and
marked cancelled, and the corrected one beneath it. Every figure in the app —
what the customer owes, revenue, best sellers, busiest days, stock — counts
only the corrected one. The crossed-out entry is kept as evidence and counted
nowhere.

**Two cases it will refuse**, and it says which:

- The customer has already paid something against that sale.
- Empties have already come back against it.

In both, money or cylinders have already moved on the strength of that sale,
so cancelling it would leave those pointing at something the app no longer
counts. Those are rarer and messier, and they are Edd's to sort out.

### A sale against the wrong customer

Same button. Fix the sale, and record the real one on the right tab.

### A payment recorded that did not happen

Record a correcting entry in the other direction, with the reason in the note.
Never try to make the wrong one disappear.

### A stock count that was wrong

This one has a screen for it. **Settings → Opening stock count** — count
again and save. It works out the difference and files a correction by itself,
leaving the original count untouched.

Do not think of it as "fixing the opening count". The opening count was true
when it was written; what changed is reality, or what you know about it.

### Something genuinely has to go

A test record that reached the real database, or something entered that should
never have been recorded at all.

**That is Edd's job, in the Supabase dashboard, by hand.** Not because it is
technically hard, but because it should be rare, deliberate, and done by
somebody accountable for it — rather than one tap on a counter phone.

---

## How to explain this to her

Her paper notebook worked exactly this way and nobody had to explain it. You
did not rub out a line when a customer disputed it. You wrote the correction
underneath, and the page showed both.

> "If something's wrong, don't try to remove it — write the fix next to it.
> The app adds it up for you. That way if anyone ever argues, the book shows
> exactly what happened, including the mistake and when you caught it."

The crossed-out line is not clutter. **It is the proof.**

---

## What this asks of you

Get the wording right on the screens where a correction is made, and make sure
she knows the phrase "record a correction" before she needs it — not in the
middle of an argument with a customer.

If corrections turn out to be frequent for one particular thing, that is not a
process problem to train away. It means a screen is inviting the mistake, and
the screen is what should change.
