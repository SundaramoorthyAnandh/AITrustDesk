import { getTicketContext } from './context.js';
import { prefixedId } from '../lib/ids.js';

export interface SentEmail {
  id: string;
  ticketId: string;
  to: string;
  toName: string;
  subject: string;
  body: string;
  sentAt: string;
}

const sentEmailsStore: SentEmail[] = [];

/**
 * Send conversation update email to customer when an agent replies to a ticket.
 */
export async function sendTicketReplyEmail(ticketId: string, replyText: string): Promise<SentEmail | null> {
  const ctx = getTicketContext(ticketId);
  if (!ctx || !ctx.customer.email) return null;

  const { customer, ticket, order } = ctx;
  const now = new Date().toISOString();
  const emailId = prefixedId('EML');
  const subject = `Update on your complaint: ${ticket.subject || 'Ticket #' + ticket.id}`;

  const bodyLines = [
    `Hi ${customer.name},`,
    '',
    `An agent has replied to your ticket #${ticket.id} (${ticket.subject || 'Complaint'}):`,
    '',
    '--------------------------------------------------',
    replyText,
    '--------------------------------------------------',
  ];

  if (order) {
    bodyLines.push('', `Linked Order: ${order.id} (${order.itemName})`);
  }

  bodyLines.push(
    '',
    'You can view the full conversation and reply in your Customer Portal.',
    '',
    'Best regards,',
    'TrustDesk Support Team'
  );

  const emailRecord: SentEmail = {
    id: emailId,
    ticketId: ticket.id,
    to: customer.email,
    toName: customer.name,
    subject,
    body: bodyLines.join('\n'),
    sentAt: now,
  };

  sentEmailsStore.push(emailRecord);
  console.log(`[EmailService] Sent conversation update email to ${customer.email} (${customer.name}) for ticket ${ticket.id}`);

  return emailRecord;
}

/**
 * Retrieve sent emails, optionally filtered by ticketId.
 */
export function getSentEmails(ticketId?: string): SentEmail[] {
  if (ticketId) {
    return sentEmailsStore.filter((e) => e.ticketId === ticketId);
  }
  return [...sentEmailsStore];
}

/**
 * Clear sent email store (useful for tests).
 */
export function clearSentEmails(): void {
  sentEmailsStore.length = 0;
}
