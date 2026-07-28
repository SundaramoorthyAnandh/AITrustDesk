import { eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { tickets, customers, orders, type Ticket, type Customer, type Order } from '../db/schema.js';

export interface TicketContext {
  ticket: Ticket;
  customer: Customer;
  order: Order | null;
}

/** Load a ticket with its linked customer and (optional) order. */
export function getTicketContext(ticketId: string): TicketContext | null {
  const db = getDb();
  const ticket = db.select().from(tickets).where(eq(tickets.id, ticketId)).get();
  if (!ticket) return null;
  const customer = db.select().from(customers).where(eq(customers.id, ticket.customerId)).get();
  if (!customer) return null;
  const order = ticket.orderId
    ? (db.select().from(orders).where(eq(orders.id, ticket.orderId)).get() ?? null)
    : null;
  return { ticket, customer, order };
}
