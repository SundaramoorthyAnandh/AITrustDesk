import type { Category } from '../llm/schemas.js';
import { evaluateWindow, type WindowEvaluation } from './time.js';

/**
 * Policy windows, in days, keyed to the KB documents that define them.
 * Kept in one place so the time rule and the drafts stay in sync with the KB.
 */
export const WINDOW_DAYS: Partial<Record<Category, number>> = {
  refund: 30, // KB-REFUND-001
  warranty: 365, // KB-WARRANTY-001
};

/**
 * Compute the window verdict for a ticket, if the category is time-bound and a
 * purchase date exists. Always uses ticket.created_at + purchase date — never the
 * clock, and never the product-registration date.
 */
export function windowForTicket(
  category: Category,
  purchaseDate: string | null | undefined,
  ticketCreatedAt: string,
): WindowEvaluation | null {
  const windowDays = WINDOW_DAYS[category];
  if (windowDays == null || !purchaseDate) return null;
  return evaluateWindow(purchaseDate, ticketCreatedAt, windowDays);
}
