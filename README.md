# TrustDesk — AI Support-Operations Agent

TrustDesk is an AI-first customer-support platform. The AI does not just generate text: it
**retrieves policy context, triages tickets, decides whether it has enough evidence, drafts
grounded cited replies, recommends approval-gated actions, and leaves a complete audit trail** —
while defending against prompt injection, identity-bypass, PII leakage, and excessive agency.

This repository contains three deployables:

| Package | Path | What it is |
| --- | --- | --- |
| **API** | [`backend/`](backend) | Fastify + SQLite/Drizzle + LangChain + minisearch service (the graded core). |
| **Customer Complaint Portal** | [`web/customer-portal/`](web/customer-portal) | React + TS + Vite + MUI app for customers to file & track complaints. |
| **Agent Console** | [`web/agent-portal/`](web/agent-portal) | React + TS + Vite + MUI app for support agents: triage, cited drafts, approvals, evals. |

> **Auth is split by design.** Customers and agents authenticate against **physically separate
> tables** (`customer_accounts` / `agent_accounts`) with independent JWT audiences. A customer
> token can never be replayed on an agent route and vice-versa. See
> [DESIGN_DECISIONS.md](DESIGN_DECISIONS.md).

---

## 🌐 Live demo (hosted free on Render)

| App | URL |
| --- | --- |
| **Customer Complaint Portal** | https://trustdesk-customer.onrender.com |
| **Agent Console** | https://trustdesk-agent.onrender.com |
| **API** | https://trustdesk-api-uk31.onrender.com/health |

Demo logins — password `Password123!`: customer `alice.johnson@example.com`, agent `agent@trustdesk.io`.

> The API is on Render's free tier: it sleeps after ~15 min idle, so the **first request may take
> ~30–60s** to wake (open the API `/health` link once, then use the portals). The database is
> ephemeral and reseeds on boot, so session-created data resets on restart — see [DEPLOY.md](DEPLOY.md).

---

## Quick start

Prerequisites: **Node ≥ 20.11**, npm ≥ 10. (LM Studio is optional — the default LLM provider is a
deterministic mock, so everything runs offline.)

```bash
# 1. install everything (monorepo workspaces)
npm install

# 2. create + migrate the DB and load the seed data (idempotent)
npm run load

# 3. run the API (http://localhost:4000)
npm run dev:api
```

In two more terminals:

```bash
npm run dev:customer   # Customer portal → http://localhost:5173
npm run dev:agent      # Agent console   → http://localhost:5174
```

### Demo logins (seeded by `npm run load`)

| Role | Email | Password |
| --- | --- | --- |
| Customer | `alice.johnson@example.com` (or any seeded customer, or self-register) | `Password123!` |
| Agent | `agent@trustdesk.io` | `Password123!` |
| Supervisor | `supervisor@trustdesk.io` | `Password123!` |
| Admin | `admin@trustdesk.io` | `Password123!` |

### Run the graded checks

```bash
npm test     # Vitest — guardrails, idempotency, grounding, time-rule, dual auth
npm run eval # runs data/eval_cases.jsonl and prints the 4-metric summary
```

### Run all three locally with one command

```bash
./run.sh
```

Starts the DB (migrate + seed), the API, and both portals with clean shutdown on Ctrl+C. `./stop.sh` frees the ports.

### Run with Docker

The whole stack runs in three containers (API + two nginx-served portals):

```bash
docker compose up --build
```

- Customer → http://localhost:8080
- Agent → http://localhost:8081
- API → http://localhost:4000

To force-rebuild fresh images without cache:
```bash
docker compose build --no-cache && docker compose up
```

The API container seeds on boot (`SEED_ON_BOOT=true`) and CORS is preconfigured for the portal ports.
The portals are built with `VITE_API_URL=http://localhost:4000` (the browser reaches the API on its
published port). Stop with `docker compose down`. See [DEPLOY.md](DEPLOY.md#run-with-docker) for details.

### Deploy (free)

A one-click **Render Blueprint** ([`render.yaml`](render.yaml)) provisions the API + both portals on Render's free tier. See [DEPLOY.md](DEPLOY.md).

---

## Environment

Copy [`backend/.env.example`](backend/.env.example) to `backend/.env` to override defaults. Every
value has a safe default, so `.env` is optional for the demo.

| Var | Default | Purpose |
| --- | --- | --- |
| `PORT` / `HOST` | `4000` / `0.0.0.0` | API bind. |
| `CORS_ORIGINS` | `http://localhost:5173,http://localhost:5174` | Allowed portal origins. |
| `DATABASE_URL` | `./trustdesk.db` | SQLite file. |
| `CUSTOMER_JWT_SECRET` / `AGENT_JWT_SECRET` | dev secrets | **Distinct** signing secrets per audience. |
| `ACCESS_TOKEN_TTL` / `REFRESH_TOKEN_TTL` | `900` / `1209600` s | JWT lifetimes. |
| `SEED_DEFAULT_PASSWORD` | `Password123!` | Password applied to every seeded account. |
| `LLM_PROVIDER` | `mock` | `mock` (deterministic) or `langchain` (LM Studio). |
| `OPENAI_BASE_URL` / `OPENAI_API_KEY` / `MODEL_NAME` | LM Studio defaults | Used only when `LLM_PROVIDER=langchain`. |

To use a **real local LLM**: start LM Studio's OpenAI-compatible server, then set
`LLM_PROVIDER=langchain`, `OPENAI_BASE_URL`, and `MODEL_NAME`. The eval runner can be pointed at it
with `npm run eval -- --provider=langchain` (from `backend/`).

---

## Architecture

```
                    Customer Portal (5173)          Agent Console (5174)
                    React+TS+Vite+MUI               React+TS+Vite+MUI
                          │   JWT (customer aud)          │   JWT (agent aud)
                          └───────────────┬───────────────┘
                                          ▼
                         ┌─────────────────────────────────┐
                         │        Fastify API (4000)         │
                         │  auth · tickets · ai · actions ·  │
                         │  eval  (rate-limited, CORS)       │
                         └───────────────┬───────────────────┘
             ┌───────────────┬───────────┼───────────────┬────────────────┐
             ▼               ▼           ▼               ▼                ▼
        LLMProvider     Retriever    Guardrails      Job queue        Drizzle/SQLite
        (interface)     (interface)  (deterministic) (non-blocking)   (WAL, FK on)
        ┌────┴────┐     ┌───┴────┐
        │ Mock    │     │mini-   │   ← AI/eval runs execute as jobs so unrelated
        │ LangChain     │search  │     ticket reads never block (build-prompt §1.8)
        └─────────┘     └────────┘
```

**Two adapter boundaries** (both swappable, both mocked in tests):
- `LLMProvider` — `triage` / `draft` / `classifyGuardrail`. Impls: `MockProvider`, `LangChainProvider`.
  Nothing downstream imports LangChain directly.
- `Retriever` — `search(query, k)`. Impl: `MiniSearchRetriever` (full-text). Swap for vector/hybrid
  without touching the draft pipeline.

**The draft pipeline enforces, in order** ([`backend/src/services/draft.ts`](backend/src/services/draft.ts)):
1. **Guardrail gate** on untrusted customer input.
2. **Retrieval** (adversarial docs excluded from grounding).
3. **Time rule** — pure helper `isWithinWindow(orderDate, ticketCreatedAt, windowDays)`, never `Date.now()`.
4. **Grounding gate** — a claim may only cite a retrieved `docId`; otherwise **refuse or escalate**.

Every AI run writes exactly **one trace row** with retrieved doc ids, tool actions, guardrail result,
and final status.

---

## API reference

Base URL (local): `http://localhost:4000`. All JSON. Protected routes require a
`Bearer <accessToken>` JWT whose **audience matches the route family** — a customer token
is rejected on `/agent/*` and vice-versa. Errors return `{ error, message }` or
`{ error:"bad_request", details:{ fieldErrors } }`. Access tokens are short-lived
(~15 min); use the refresh endpoints to rotate. AI/eval endpoints return `202 {jobId}` — poll
`GET /jobs/:jobId`.

### System
| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | — | Liveness: `{status,service,time}` |

### Auth — customer (audience `trustdesk-customer`)
| Method | Path | Auth | Body → Result |
| --- | --- | --- | --- |
| POST | `/auth/customer/register` | — | `{name,email,password}` → `201` tokens + `profile` (self-registration) |
| POST | `/auth/customer/login` | — | `{email,password}` → tokens + profile (`401`/`423` on invalid/locked) |
| POST | `/auth/customer/refresh` | — | `{refreshToken}` → new token pair (rotates; old one revoked) |
| POST | `/auth/customer/logout` | — | `{refreshToken}` → `204` |
| GET | `/auth/customer/me` | customer | → `{profile}` |
| POST | `/auth/customer/password` | customer | `{currentPassword,newPassword}` → `204` (blocks reuse; **revokes all sessions**) |

### Auth — agent (audience `trustdesk-agent`; no self-registration)
| Method | Path | Auth | Body → Result |
| --- | --- | --- | --- |
| POST | `/auth/agent/login` | — | `{email,password}` → tokens + profile (incl. `role`) |
| POST | `/auth/agent/refresh` | — | `{refreshToken}` → new token pair |
| POST | `/auth/agent/logout` | — | `{refreshToken}` → `204` |
| GET | `/auth/agent/me` | agent | → `{profile}` |
| POST | `/auth/agent/password` | agent | `{currentPassword,newPassword}` → `204` |

### Customer — self-service (scoped to caller)
| Method | Path | Auth | Body → Result |
| --- | --- | --- | --- |
| GET | `/me/products` | customer | → `{products}` (active catalog, priced in ₹/INR) |
| POST | `/me/orders` | customer | `{sku,quantity(1–20)}` → `201 {order}` (priced server-side, dated now) |
| GET | `/me/orders` | customer | → `{orders}` |
| POST | `/me/tickets` | customer | `{subject,body,orderId?}` → `201 {ticket,customer,order}` (orderId must belong to caller) |
| GET | `/me/tickets` | customer | → `{tickets}` |
| GET | `/me/tickets/:id` | customer | → `{ticket,order,replies}` (own only; conversation thread) |
| POST | `/me/tickets/:id/reply` | customer | `{text}` → follow-up reply (`400` if closed) |
| PATCH | `/me/tickets/:id` | customer | `{status}` → close / reopen own ticket |

### Agent — ticket workspace
| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/agent/tickets` | agent | Queue; query `status,category,escalated,limit,offset` |
| GET | `/agent/tickets/:id` | agent | Ticket + customer + order context |
| GET | `/agent/tickets/:id/drafts` | agent | Draft history |
| GET | `/agent/tickets/:id/actions` | agent | Proposed / executed tool actions |
| GET | `/agent/tickets/:id/traces` | agent | Audit traces |
| GET | `/agent/tickets/:id/latest-draft` | agent | Most recent draft (or `null`) |
| GET | `/agent/tickets/:id/search` | agent | Retrieval preview; query `q` → `{query,hits}` |
| PATCH | `/agent/tickets/:id` | agent | `{status?,assign?}` → assign / change status |

### Agent — AI pipeline (non-blocking jobs)
| Method | Path | Auth | Result |
| --- | --- | --- | --- |
| POST | `/agent/tickets/:id/triage` | agent | `202 {jobId}` → `{ticket,triage}` |
| POST | `/agent/tickets/:id/draft` | agent | `202 {jobId}` → grounded / refused / escalated draft |
| GET | `/jobs/:jobId` | agent | Job `{status,result,error}` (poll until `done`/`error`) |

### Agent — drafts
| Method | Path | Auth | Body → Result |
| --- | --- | --- | --- |
| PATCH | `/agent/drafts/:draftId` | agent | `{text,citations?}` → edit draft (only while `draft`; `409` if `sent`; audited) |
| POST | `/agent/drafts/:draftId/send` | agent | → publish draft to customer (`status:"sent"`) |

### Agent — sensitive actions (approval-gated)
| Method | Path | Auth | Body → Result |
| --- | --- | --- | --- |
| GET | `/agent/catalog` | agent | → `{tools}` (name, label, sensitive, requiresApproval) |
| POST | `/agent/tickets/:id/actions` | agent | `{toolName,args,idempotencyKey?}` (or `Idempotency-Key` header) → `201` pending; **`400` if no/ mismatched linked order** |
| GET | `/agent/actions/:id` | agent | → tool_call + `{approvals}` |
| POST | `/agent/actions/:id/approve` | agent | `{note?}` → executes **exactly once** (idempotent; `409` if rejected) |
| POST | `/agent/actions/:id/reject` | agent | `{note?}` → `rejected` (never executes) |

### Agent — evaluations
| Method | Path | Auth | Result |
| --- | --- | --- | --- |
| POST | `/agent/eval` | agent | `202 {jobId}` → 4-metric summary |
| GET | `/agent/eval/latest` | agent | → `{run\|null}` most recent summary |
| GET | `/agent/eval/runs` | agent | → `{runs}` (history) |

---

## Evaluation flow

`npm run eval` (or `POST /agent/eval`) runs [`backend/data/eval_cases.jsonl`](backend/data/eval_cases.jsonl)
through the exact same triage + draft pipeline used in production and prints/persists a summary with
the four graded metrics:

- **Triage accuracy** — predicted category vs. expected.
- **Citation coverage** — expected `KB-*` ids ⊆ produced citations.
- **Unsafe-action blocking rate** — adversarial cases blocked and never auto-executed.
- **Escalation behavior** — system escalates (at triage or draft) when it should.

The default provider is the deterministic `MockProvider`, so results are reproducible. Each eval case
also writes a `run_type:"eval"` trace.

---

## Known limitations

- **Seed data is synthetic.** The `data/` files referenced by the brief were not supplied, so realistic
  fixtures were generated (KB ids like `KB-REFUND-001`/`KB-ADVERSARIAL-001` are preserved verbatim, as
  evals depend on them). See [DESIGN_DECISIONS.md](DESIGN_DECISIONS.md).
- **MockProvider triage is keyword-based** — deterministic and reproducible, but not semantic. Point
  `LLM_PROVIDER=langchain` at LM Studio for a real model.
- **Single-node SQLite** for the graded slice. The store, auth, retrieval, and job queue sit behind
  interfaces with a documented path to Postgres/Redis/vector-hybrid at scale — see [STRETCH.md](STRETCH.md).
- **Tokens in `localStorage`** on the frontends for demo simplicity; httpOnly cookies are the
  production recommendation (noted in STRETCH.md).
- **Guardrail engine is rule-based + LLM-secondary.** The deterministic scanner is authoritative
  (can't be talked out of a decision); the LLM classifier is defense-in-depth.

## Repository layout

```
backend/            Fastify API, Drizzle schema, LLM providers, retrieval, services, eval, tests
  src/db/           schema.ts, client.ts, migrate.ts
  src/llm/          provider.ts (interface), mock.provider.ts, langchain.provider.ts, schemas.ts
  src/retrieval/    retriever.ts (interface), minisearch.retriever.ts
  src/domain/       time.ts, guardrails.ts, grounding via draft, policy.ts, classify.ts
  src/services/     triage, draft, actions, auth, traces, context
  src/routes/       auth, tickets, ai, actions, eval
  data/             customers/orders/tickets/documents/tool_catalog + eval_cases.jsonl
  test/             vitest suites
web/customer-portal Customer Complaint Portal (React+TS+Vite+MUI)
web/agent-portal    Agent Console (React+TS+Vite+MUI)
DESIGN_DECISIONS.md · STRETCH.md
```
