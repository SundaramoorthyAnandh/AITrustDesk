/**
 * Time rule (build-prompt §1.4 — graded, unit-tested).
 *
 * Return / warranty / refund windows are evaluated against the ORDER date and the
 * TICKET's created_at — NEVER against the wall clock. Keeping this in one pure,
 * dependency-free helper means eval results are deterministic and reproducible.
 *
 * A ticket is "within window" when it was opened no later than `windowDays`
 * after the order date (inclusive), and not before the order date.
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

/** Whole-day difference ticketCreatedAt - orderDate (can be negative). */
export function daysBetween(orderDate: string, ticketCreatedAt: string): number {
  const order = toEpochMs(orderDate, 'order');
  const ticket = toEpochMs(ticketCreatedAt, 'ticket created_at');
  return Math.floor((ticket - order) / MS_PER_DAY);
}

/**
 * True iff the ticket was opened within [orderDate, orderDate + windowDays].
 * Deterministic: depends only on its three arguments.
 */
export function isWithinWindow(
  orderDate: string,
  ticketCreatedAt: string,
  windowDays: number,
): boolean {
  if (!Number.isFinite(windowDays) || windowDays < 0) {
    throw new RangeError(`windowDays must be a non-negative number, got ${windowDays}`);
  }
  const elapsed = daysBetween(orderDate, ticketCreatedAt);
  return elapsed >= 0 && elapsed <= windowDays;
}

/** Rich result for prompt-building / audit: how many days elapsed and the verdict. */
export interface WindowEvaluation {
  windowDays: number;
  elapsedDays: number;
  within: boolean;
}

export function evaluateWindow(
  orderDate: string,
  ticketCreatedAt: string,
  windowDays: number,
): WindowEvaluation {
  const elapsedDays = daysBetween(orderDate, ticketCreatedAt);
  return {
    windowDays,
    elapsedDays,
    within: isWithinWindow(orderDate, ticketCreatedAt, windowDays),
  };
}
