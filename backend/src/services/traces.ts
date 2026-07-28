import { getDb } from '../db/client.js';
import { traces, type Trace } from '../db/schema.js';
import { newId } from '../lib/ids.js';

export interface TraceInput {
  ticketId?: string | null;
  runType: 'triage' | 'draft' | 'guardrail' | 'eval';
  retrievedDocIds?: string[];
  toolActions?: unknown[];
  guardrailResult?: string | null;
  finalStatus: string;
  provider?: string | null;
  latencyMs?: number | null;
  detail?: Record<string, unknown> | null;
}

/** Write exactly one trace row per AI run (build-prompt §1.9). */
export function writeTrace(input: TraceInput): Trace {
  const now = new Date().toISOString();
  const row: Trace = {
    id: newId(),
    ticketId: input.ticketId ?? null,
    runType: input.runType,
    retrievedDocIds: input.retrievedDocIds ?? [],
    toolActions: input.toolActions ?? [],
    guardrailResult: input.guardrailResult ?? null,
    finalStatus: input.finalStatus,
    provider: input.provider ?? null,
    latencyMs: input.latencyMs ?? null,
    detail: input.detail ?? null,
    createdAt: now,
  };
  getDb().insert(traces).values(row).run();
  return row;
}
