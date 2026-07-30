/**
 * Time rule (build-prompt §1.4 — graded, unit-tested).
 *
 * Return / warranty / refund windows are evaluated against the PURCHASE date and
 * the TICKET's created_at — NEVER against the wall clock, and never against the
 * product-registration date. Keeping this in one pure, dependency-free helper
 * means eval results are deterministic and reproducible.
 *
 * A ticket is "within window" when it was opened no later than `windowDays`
 * after the purchase date (inclusive), and not before the purchase date.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Parse an ISO-8601 date/datetime to epoch ms. Throws on invalid input. */
function toEpochMs(iso: string, label: string): number {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    throw new RangeError(`Invalid ${label} date: ${JSON.stringify(iso)}`);
  }
  return ms;
}

/** Whole-day difference ticketCreatedAt - purchaseDate (can be negative). */
export function daysBetween(purchaseDate: string, ticketCreatedAt: string): number {
  const purchase = toEpochMs(purchaseDate, 'purchase');
  const ticket = toEpochMs(ticketCreatedAt, 'ticket created_at');
  return Math.floor((ticket - purchase) / MS_PER_DAY);
}

/**
 * True iff the ticket was opened within [purchaseDate, purchaseDate + windowDays].
 * Deterministic: depends only on its three arguments.
 */
export function isWithinWindow(
  purchaseDate: string,
  ticketCreatedAt: string,
  windowDays: number,
): boolean {
  if (!Number.isFinite(windowDays) || windowDays < 0) {
    throw new RangeError(`windowDays must be a non-negative number, got ${windowDays}`);
  }
  const elapsed = daysBetween(purchaseDate, ticketCreatedAt);
  return elapsed >= 0 && elapsed <= windowDays;
}

/** Rich result for prompt-building / audit: how many days elapsed and the verdict. */
export interface WindowEvaluation {
  windowDays: number;
  elapsedDays: number;
  within: boolean;
}

export function evaluateWindow(
  purchaseDate: string,
  ticketCreatedAt: string,
  windowDays: number,
): WindowEvaluation {
  const elapsedDays = daysBetween(purchaseDate, ticketCreatedAt);
  return {
    windowDays,
    elapsedDays,
    within: isWithinWindow(purchaseDate, ticketCreatedAt, windowDays),
  };
}
