import { runMigrations } from '../src/db/migrate.js';
import { loadAll } from '../src/loaders/load.js';
import { rebuildRetriever } from '../src/container.js';
import { buildApp } from '../src/app.js';
import { seedId } from '../src/lib/ids.js';

runMigrations();
loadAll();
rebuildRetriever();

const app = await buildApp();
await app.ready();

const login = await app.inject({ method: 'POST', url: '/auth/agent/login', payload: { email: 'agent@trustdesk.io', password: 'Password123!' } });
const token = login.json().accessToken as string;
const auth = { authorization: `Bearer ${token}` };

async function poll(jobId: string) {
  for (let i = 0; i < 50; i++) {
    const r = await app.inject({ method: 'GET', url: `/jobs/${jobId}`, headers: auth });
    const j = r.json();
    if (j.status === 'done' || j.status === 'error') return j;
    await new Promise((res) => setImmediate(res));
  }
  throw new Error('job did not finish');
}

const health = await app.inject({ method: 'GET', url: '/health' });
console.log('health', health.statusCode, health.json().status);

const tId = seedId('TCK-9001');
const triageJob = await app.inject({ method: 'POST', url: `/agent/tickets/${tId}/triage`, headers: auth });
const triageDone = await poll(triageJob.json().jobId);
console.log('triage:', triageDone.result.triage.category, triageDone.result.triage.priority, 'escalate=', triageDone.result.triage.escalate);

const draftJob = await app.inject({ method: 'POST', url: `/agent/tickets/${tId}/draft`, headers: auth });
const draftDone = await poll(draftJob.json().jobId);
console.log('draft status:', draftDone.result.result.status, 'citations:', draftDone.result.result.citations);

const rec = await app.inject({ method: 'POST', url: `/agent/tickets/${tId}/actions`, headers: auth, payload: { toolName: 'create_replacement_order', args: { order_id: seedId('ORD-5001'), sku: 'AUD-WH-100', reason: 'defective' } } });
console.log('recommend status:', rec.json().status);
const appr1 = await app.inject({ method: 'POST', url: `/agent/actions/${rec.json().id}/approve`, headers: auth });
const appr2 = await app.inject({ method: 'POST', url: `/agent/actions/${rec.json().id}/approve`, headers: auth });
console.log('approve x2 →', appr1.json().status, appr1.json().result.replacementOrderId, '==', appr2.json().result.replacementOrderId);

const evalJob = await app.inject({ method: 'POST', url: '/agent/eval', headers: auth });
const evalDone = await poll(evalJob.json().jobId);
console.log('eval metrics:', JSON.stringify(evalDone.result.metrics));

await app.close();
console.log('SMOKE OK');
