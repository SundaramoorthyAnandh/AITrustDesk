import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { getDb, getSqlite } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { loadAll } from '../loaders/load.js';
import { evalRuns } from '../db/schema.js';
import { getProvider, rebuildRetriever, setProvider } from '../container.js';
import { MockProvider } from '../llm/mock.provider.js';
import { LangChainProvider } from '../llm/langchain.provider.js';
import { runDraftPipeline } from '../services/draft.js';
import { writeTrace } from '../services/traces.js';
import { scanText, guardrailResultString } from '../domain/guardrails.js';
import { TriageResultSchema } from '../llm/schemas.js';
import { newId } from '../lib/ids.js';
import type { LLMProvider, OrderContext } from '../llm/provider.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CASES_PATH = resolve(__dirname, '../../data/eval_cases.jsonl');

interface EvalCase {
  id: string;
  description: string;
  input: {
    subject?: string;
    body: string;
    created_at: string;
    order?: {
      order_date: string;
      status: string;
      item_name?: string;
      sku?: string;
      amount_cents?: number;
    };
  };
  expect: {
    category?: string;
    priority?: string;
    escalate?: boolean;
    citations?: string[];
    adversarial?: boolean;
    guardrail?: string;
    within_window?: boolean;
    expect_status?: string;
  };
}

interface CaseResult {
  id: string;
  description: string;
  predictedCategory: string;
  predictedPriority: string;
  systemEscalated: boolean;
  draftStatus: string;
  guardrailKind: string;
  citations: string[];
  checks: {
    categoryCorrect: boolean | null;
    priorityCorrect: boolean | null;
    escalateCorrect: boolean | null;
    citationCovered: boolean | null;
    unsafeBlocked: boolean | null;
    guardrailKindCorrect: boolean | null;
    windowCorrect: boolean | null;
  };
}

function readCases(): EvalCase[] {
  return readFileSync(CASES_PATH, 'utf-8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as EvalCase);
}

function pct(numer: number, denom: number): number {
  return denom === 0 ? 0 : Math.round((numer / denom) * 1000) / 10;
}

export interface EvalSummary {
  provider: string;
  totalCases: number;
  metrics: {
    triageAccuracy: number;
    priorityAccuracy: number;
    citationCoverage: number;
    unsafeActionBlockingRate: number;
    escalationBehavior: number;
  };
  denominators: Record<string, number>;
  cases: CaseResult[];
}

export async function runEval(provider: LLMProvider = getProvider()): Promise<EvalSummary> {
  rebuildRetriever(); // ensure the index reflects loaded documents
  const cases = readCases();
  const results: CaseResult[] = [];

  for (const c of cases) {
    const text = `${c.input.subject ?? ''}\n${c.input.body}`;
    const guardrail = scanText(text);

    // Triage (mirrors triage service: guardrail forces escalation).
    let category = 'general';
    let priority = 'low';
    let triageEscalate = false;
    try {
      const raw = await provider.triage({
        subject: c.input.subject ?? null,
        body: c.input.body,
        order: c.input.order
          ? ({ id: 'EVAL', orderDate: c.input.order.order_date, status: c.input.order.status, itemName: c.input.order.item_name } as OrderContext)
          : null,
        customer: null,
      });
      const parsed = TriageResultSchema.parse(raw);
      category = parsed.category;
      priority = parsed.priority;
      triageEscalate = parsed.escalate;
    } catch {
      category = 'general';
      priority = 'high';
      triageEscalate = true;
    }
    if (!guardrail.safe && (guardrail.matched.includes('identity_bypass') || guardrail.matched.includes('prompt_injection'))) {
      triageEscalate = true;
    }

    // Draft (grounding gate + time rule + guardrail gate).
    const order: OrderContext | null = c.input.order
      ? {
          id: 'EVAL-ORDER',
          orderDate: c.input.order.order_date,
          status: c.input.order.status,
          itemName: c.input.order.item_name,
          itemSku: c.input.order.sku,
          amountCents: c.input.order.amount_cents,
        }
      : null;

    const draft = await runDraftPipeline(
      {
        subject: c.input.subject ?? null,
        body: c.input.body,
        order,
        ticketCreatedAt: c.input.created_at,
        categoryHint: category as never,
      },
      { provider },
    );

    const systemEscalated = triageEscalate || draft.status === 'escalated';

    const e = c.expect;
    const checks: CaseResult['checks'] = {
      categoryCorrect: e.category != null ? category === e.category : null,
      priorityCorrect: e.priority != null ? priority === e.priority : null,
      escalateCorrect: e.escalate != null ? systemEscalated === e.escalate : null,
      citationCovered:
        e.citations && e.citations.length > 0 ? e.citations.every((id) => draft.citations.includes(id)) : null,
      unsafeBlocked: e.adversarial ? !draft.guardrail.safe && draft.status !== 'draft' : null,
      guardrailKindCorrect: e.guardrail ? draft.guardrail.matched.includes(e.guardrail as never) : null,
      windowCorrect: e.within_window != null ? draft.window?.within === e.within_window : null,
    };

    // One trace per eval case (build-prompt §1.9).
    writeTrace({
      ticketId: null,
      runType: 'eval',
      retrievedDocIds: draft.retrievedDocIds,
      guardrailResult: guardrailResultString(draft.guardrail),
      finalStatus: draft.status,
      provider: provider.name,
      detail: { caseId: c.id, category, priority, systemEscalated, citations: draft.citations },
    });

    results.push({
      id: c.id,
      description: c.description,
      predictedCategory: category,
      predictedPriority: priority,
      systemEscalated,
      draftStatus: draft.status,
      guardrailKind: draft.guardrail.kind,
      citations: draft.citations,
      checks,
    });
  }

  const count = (sel: (r: CaseResult) => boolean | null) => {
    let numer = 0;
    let denom = 0;
    for (const r of results) {
      const v = sel(r);
      if (v === null) continue;
      denom++;
      if (v) numer++;
    }
    return { numer, denom };
  };

  const cat = count((r) => r.checks.categoryCorrect);
  const prio = count((r) => r.checks.priorityCorrect);
  const cite = count((r) => r.checks.citationCovered);
  const unsafe = count((r) => r.checks.unsafeBlocked);
  const esc = count((r) => r.checks.escalateCorrect);

  const summary: EvalSummary = {
    provider: provider.name,
    totalCases: results.length,
    metrics: {
      triageAccuracy: pct(cat.numer, cat.denom),
      priorityAccuracy: pct(prio.numer, prio.denom),
      citationCoverage: pct(cite.numer, cite.denom),
      unsafeActionBlockingRate: pct(unsafe.numer, unsafe.denom),
      escalationBehavior: pct(esc.numer, esc.denom),
    },
    denominators: {
      triage: cat.denom,
      priority: prio.denom,
      citation: cite.denom,
      unsafeAction: unsafe.denom,
      escalation: esc.denom,
    },
    cases: results,
  };

  // Persist the eval run.
  const now = new Date().toISOString();
  getDb()
    .insert(evalRuns)
    .values({
      id: newId(),
      startedAt: now,
      finishedAt: new Date().toISOString(),
      provider: provider.name,
      summary: summary as unknown as Record<string, unknown>,
    })
    .run();

  return summary;
}

function printSummary(s: EvalSummary): void {
  /* eslint-disable no-console */
  console.log('\n═══════════════════ TrustDesk Eval Summary ═══════════════════');
  console.log(`Provider: ${s.provider}   Cases: ${s.totalCases}`);
  console.log('───────────────────────────────────────────────────────────────');
  console.log(`  Triage accuracy (category)   : ${s.metrics.triageAccuracy}%   (n=${s.denominators.triage})`);
  console.log(`  Priority accuracy            : ${s.metrics.priorityAccuracy}%   (n=${s.denominators.priority})`);
  console.log(`  Citation coverage            : ${s.metrics.citationCoverage}%   (n=${s.denominators.citation})`);
  console.log(`  Unsafe-action blocking rate  : ${s.metrics.unsafeActionBlockingRate}%   (n=${s.denominators.unsafeAction})`);
  console.log(`  Escalation behavior          : ${s.metrics.escalationBehavior}%   (n=${s.denominators.escalation})`);
  console.log('───────────────────────────────────────────────────────────────');
  for (const c of s.cases) {
    const marks = Object.entries(c.checks)
      .filter(([, v]) => v !== null)
      .map(([k, v]) => `${v ? '✓' : '✗'}${k.replace('Correct', '').replace('Covered', '').replace('unsafeBlocked', 'blocked')[0]}`)
      .join(' ');
    const flag = Object.values(c.checks).some((v) => v === false) ? '⚠️ ' : '   ';
    console.log(`${flag}${c.id}  cat=${c.predictedCategory} pri=${c.predictedPriority} status=${c.draftStatus} esc=${c.systemEscalated} [${marks}]`);
  }
  console.log('═══════════════════════════════════════════════════════════════\n');
  /* eslint-enable no-console */
}

// CLI entry
const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  runMigrations();
  loadAll(); // idempotent — guarantees KB docs exist for retrieval
  const wantLangchain = process.argv.includes('--provider=langchain');
  setProvider(wantLangchain ? new LangChainProvider() : new MockProvider());
  runEval()
    .then((summary) => {
      printSummary(summary);
      getSqlite().close();
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('❌ Eval failed:', err);
      process.exit(1);
    });
}
