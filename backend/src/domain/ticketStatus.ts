import { eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { tickets } from '../db/schema.js';

/** A ticket in one of these states is read-only — it accepts no mutations. */
export const READ_ONLY_TICKET_STATUSES = new Set(['closed', 'resolved']);

/**
 * True when the ticket is closed/resolved. Mutating endpoints (triage, draft,
 * edit, send, recommend/approve/reject) reject with 409 so a closed ticket is
 * genuinely read-only — not just disabled in the UI. Reopening it lifts this.
 * Returns false for a missing ticket (callers handle 404 separately).
 */
export function isTicketReadOnly(ticketId: string): boolean {
  const row = getDb().select({ status: tickets.status }).from(tickets).where(eq(tickets.id, ticketId)).get();
  return row ? READ_ONLY_TICKET_STATUSES.has(row.status) : false;
}

/** Standard 409 body for a mutation attempted on a read-only ticket. */
export const TICKET_READ_ONLY_ERROR = {
  error: 'ticket_read_only',
  message: 'This ticket is closed or resolved and is read-only. Reopen it to make changes.',
} as const;
