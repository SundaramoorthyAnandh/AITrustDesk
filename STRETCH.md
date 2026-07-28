# STRETCH — Scaling TrustDesk to millions of users

The graded core is deliberately a small, correct, single-node slice (build-prompt §4 forbids scaling
infra in Phases 0–10). This document is the **deployment/scaling plan** that the core was architected
to accommodate without a rewrite. Everything below is enabled by the boundaries already in the code —
the `LLMProvider` / `Retriever` interfaces, the job-queue surface, Drizzle's dialect portability, and
stateless JWT auth.

> Nothing here is required to run or grade the app. It is the roadmap for taking the same architecture
> to high scale.

## Why the core is already scale-ready

| Concern | Core today | Why it scales cleanly |
| --- | --- | --- |
| **Auth** | Stateless JWT, per-audience secrets | No server session affinity → horizontal scale-out for free. |
| **Store** | Drizzle + SQLite | Same schema/queries compile to Postgres — dialect swap, not rewrite. |
| **Retrieval** | `Retriever` interface (minisearch) | Swap for pgvector / OpenSearch / hybrid behind the same method. |
| **AI/eval** | `jobQueue` behind a tiny surface | Swap for Redis + BullMQ workers; API stays non-blocking. |
| **LLM** | `LLMProvider` interface | Point at a hosted/gateway model or a fleet of LM Studio nodes. |
| **Idempotency** | `idempotency_key UNIQUE` + deterministic effect ids | Survives retries and at-least-once queue semantics. |

## 1. Postgres migration (Drizzle)

1. Add `drizzle-orm/node-postgres` + `pg`; introduce `dialect: 'postgresql'` config.
2. Timestamps are already ISO-8601 text and JSON is `text({mode:'json'})` → map to `timestamptz` /
   `jsonb`; indexes already declared in `schema.ts` carry over.
3. Introduce a connection **pool** (`pg.Pool`, `PgBouncer` in transaction mode) — the `getDb()`
   singleton is the only call site to change.
4. Read replicas for the ticket-read path; route writes to the primary. WAL-style reader/writer
   separation already assumed by the code.

## 2. Containerization & orchestration

- **Dockerfile** per deployable (API, customer-portal, agent-portal) — multi-stage, distroless runtime.
- **docker-compose** for local parity: `api`, `postgres`, `redis`, `web` (nginx serving built SPAs).
- **Kubernetes**: `Deployment` + `HPA` (CPU + queue-depth custom metric) for the stateless API;
  `Deployment` for queue workers scaled on Redis backlog; `Ingress` + TLS; `Secret`s for JWT secrets and
  model credentials; `PodDisruptionBudget`s; readiness on `/health`, liveness on a DB ping.

## 3. Message queue for AI/eval (Redis + BullMQ)

Replace the in-process `jobQueue` with a Redis-backed queue and dedicated worker pods. Triage/draft/eval
become durable jobs with retries, dead-letter queues, and back-pressure. The API only enqueues and
serves status → it never blocks and scales independently of AI throughput. Job status polling can be
upgraded to Server-Sent Events / WebSockets.

## 4. LLM at scale

- Front the `LLMProvider` with a **gateway** (rate-limit, per-tenant quotas, retries, circuit-breaker,
  cost accounting, prompt/response caching keyed on normalized input).
- Run multiple model backends (LM Studio fleet or hosted) behind a load balancer; the interface hides it.
- Cache guardrail classifications and triage of near-duplicate messages.

## 5. Retrieval at scale (vector / hybrid)

Implement `Retriever` with **pgvector** or **OpenSearch**: embed KB docs, do hybrid (BM25 + vector)
retrieval with a reranker, and keep the same `search(query, k)` contract. Re-index on KB change via a
background job. The grounding gate is unchanged.

## 6. Security & multi-tenancy hardening

- **httpOnly, Secure, SameSite cookies** for tokens instead of `localStorage`; CSRF tokens for cookie
  auth; short access TTL + rotating refresh (rotation already implemented).
- **Full RBAC** on agent roles (`agent`/`supervisor`/`admin`) — e.g. only `supervisor+` may approve
  refunds above a threshold (`requireAgentRole` already exists as the hook).
- Per-tenant + per-IP rate limiting backed by Redis; WAF; secret manager (Vault/KMS) for JWT + model keys.
- Row-level security / tenant_id scoping in Postgres for a multi-org deployment.
- PII minimization in logs and traces; field-level encryption for sensitive columns.

## 7. Observability

- Structured JSON logging with request/trace correlation ids (pino → OpenTelemetry).
- Distributed tracing across API → queue → worker → LLM.
- Metrics: triage latency, draft grounding rate, guardrail block rate, approval throughput, eval scores
  over time (the `traces` and `eval_runs` tables are the source data).
- Dashboards + alerting on unsafe-action-blocking regressions and escalation-rate anomalies.

## 8. Data & delivery

- CDN for the built SPAs; blue/green or canary deploys.
- Nightly eval runs in CI against `MockProvider` (regression gate) and periodic runs against the real
  model (quality drift).
- Backup/PITR for Postgres; migration gating in CI (`drizzle-kit`).

---

**Bottom line:** the graded slice is intentionally minimal, but every heavy dependency is behind an
interface or a portable abstraction, so each item above is an additive, low-risk change rather than a
re-architecture.
