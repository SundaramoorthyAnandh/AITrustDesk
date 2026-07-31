# TrustDesk — Requirements Coverage Report

**Project:** TrustDesk — AI Support Operations Agent
**Reference:** Airtribe AI‑first Engineering capstone brief (`TrustDesk.pdf`)
**Report date:** 2026‑07‑31
**Repository:** https://github.com/SundaramoorthyAnandh/AITrustDesk
**Verified against branch:** `feat/purchase-vs-registration-date`

---

## Verification snapshot (run at report time)

| Check | Result |
|---|---|
| Automated tests | **84 passing** across 17 test files |
| Eval — Triage accuracy | **100%** (n=14) |
| Eval — Citation coverage | **100%** (n=11) |
| Eval — Unsafe‑action blocking | **100%** (n=4) |
| Eval — Escalation behavior | **100%** (n=14) |
| Eval — Priority accuracy *(bonus, not a required metric)* | 71.4% (n=14) |
| Frontend builds (customer + agent) | Clean |

> The four eval metrics the brief asks for (triage, citation coverage, unsafe‑action blocking, escalation) are all **100%** on the deterministic mock provider. *Priority accuracy* is an extra metric we surface; its 4 misses are escalation‑edge cases (adversarial/refused and general‑escalated tickets) where the labelled priority differs from triage output.

---

## 1. Objective — the seven capabilities (PDF p.1)

| # | Capability | Status | Where |
|---|---|---|---|
| 1 | Ingest support docs + retrieve policy context | ✅ Done | MiniSearch full‑text retriever behind a `Retriever` interface |
| 2 | Triage by intent, priority, escalation | ✅ Done | `services/triage.ts`, `domain/classify.ts` |
| 3 | Grounded, cited draft replies from the KB | ✅ Done | `services/draft.ts` — grounding gate cites `docId` or refuses |
| 4 | Suggest safe actions (replacement / refund review / coupon / escalation) | ✅ Mostly | `start_refund_review` + `create_replacement_order` + escalation implemented; **coupon creation is intentionally guardrailed**, not offered (anti‑excessive‑agency) |
| 5 | Require human approval before sensitive execution | ✅ Done | Approval‑gated, `approvals` table |
| 6 | Defend against injection / unsupported claims / PII / excessive agency | ✅ Mostly | Injection, identity‑bypass, secret‑reveal, unsupported‑claim, agency‑limit covered; broad PII output‑redaction is partial |
| 7 | Track evals + minimal trace data | ✅ Done | `traces` table + one‑command/endpoint eval runner |

## 2. Key Features — Must‑Have workflow (PDF p.2)

| Feature | Status | Notes |
|---|---|---|
| Load customers/orders/tickets/tool‑catalog/eval‑cases/KB | ✅ Done | Idempotent loader; boot‑seed for ephemeral hosts |
| Preserve document IDs (e.g. `KB-REFUND-001`) | ✅ Done | KB/SKU/tool IDs kept **verbatim**; only entity PKs are UUIDs |
| Return/warranty windows vs `created_at`, never the clock | ✅ Done | `domain/time.ts` — now anchored on the **purchase date** (never `Date.now()`, never the registration date) |
| Ticket APIs (list / fetch / linked customer+order) | ✅ Done | Documented in README API reference |
| Simple agent frontend (open, triage, draft, citations, review 1 action, see evals) | ✅ Done + exceeded | Full **Agent Console** (WhatsApp‑style conversation + composer) **and** a Customer Portal |
| KB search + cited draft using ticket + customer/order + retrieved docs | ✅ Done | |
| Refuse / escalate when unsupported by retrieval | ✅ Done | Fail‑closed grounding gate |
| Triage categories (shipping/refund/warranty/billing/account_security/general) | ✅ Done | |
| Priority (low/med/high/urgent) + escalation decision | ✅ Done | |
| One approval‑gated tool (refund review **or** replacement order) | ✅ Done — **both** implemented | |
| Idempotency key prevents duplicate actions | ✅ Done | UNIQUE key; approve‑twice‑executes‑once; deterministic effect IDs |
| Guardrails: identity bypass, hidden‑coupon injection, reveal secrets/prompts | ✅ Done | Rule‑based scanner + LLM defense‑in‑depth |
| `KB-ADVERSARIAL-001` treated as data, never followed | ✅ Done | Excluded from retrieval; verified in tests |
| Trace per AI run (ticketID, runType, retrieved docIDs, tool actions, guardrail result, final status) | ✅ Done | |
| One command/endpoint to run `eval_cases.jsonl` + summary report | ✅ Done | `npm run eval` **and** `POST /agent/eval` + Evaluations page |

## 3. Technical Requirements (PDF p.3)

| Requirement | Status | Notes |
|---|---|---|
| RESTful APIs | ✅ Done | Fastify; full endpoint reference in README |
| Reliable persistent store (tickets, customers, orders, docs, drafts, tool calls, approvals, traces) | ✅ Done | SQLite + Drizzle (WAL, FK on, migrations) |
| Simple auth (demo token/login); full RBAC good‑to‑have | ✅ Exceeded | Dual JWT (separate customer/agent tables, refresh rotation, lockout). RBAC roles exist; approve not role‑gated → **RBAC partial (good‑to‑have)** |
| Retrieval layer (full‑text / vector / hybrid / documented substitute) | ✅ Done | MiniSearch full‑text, documented |
| AI provider behind an adapter, mockable in tests | ✅ Done | `LLMProvider` → Mock (default) / LangChain; **auto‑falls back to mock when no key is configured** |
| Idempotency for the approval‑gated action | ✅ Done | |
| Automated tests for critical flows + guardrails | ✅ Done | 84 tests incl. guardrails, idempotency, grounding, read‑only, eval‑timeout |
| Avoid blocking unrelated requests during long AI/eval ops | ✅ Done | In‑memory job queue, `202 {jobId}` + poll; eval is **bounded** (concurrency + per‑case timeout) so it can never hang |
| One command/endpoint to run evals + summary | ✅ Done | |
| No lock‑in to language/framework/hosted AI provider | ✅ Done | Deterministic mock = zero external dependency |

## 4. Assessment Criteria (PDF p.3)

- **Must‑Have Workflow — 60%:** ✅ Fully working end‑to‑end (data load, APIs, both frontends, triage, cited drafts, approval‑gated action + idempotency, traces, evals).
- **AI Quality & Guardrails — 25%:** ✅ Grounded + cited, escalates when uncertain, **100%** safe on adversarial eval cases.
- **Engineering, Documentation & Demo — 15%:** ✅ Maintainable, layered code; README + DESIGN_DECISIONS + STRETCH + DEPLOY; overview deck; demo flows recorded.

## 5. Deliverables (PDF p.4)

| # | Deliverable | Status |
|---|---|---|
| 1 | Final, functional product | ✅ Done (local, Docker, and Render deploy) |
| 2 | README (setup, API docs, architecture, design decisions, eval flow, known limitations) | ✅ Done (README + DESIGN_DECISIONS + STRETCH + DEPLOY) |
| 3 | Public GitHub repository link | ✅ Public — `AITrustDesk`. ⚠️ Latest work lives on `feat/purchase-vs-registration-date` (8 commits ahead of `main`) with a PR open; merge to `main` to make it the default view |
| 4 | Explainer video (triage → cited draft → approval action → guardrail → eval) | ⚠️ **Partial** — Playwright recorder produces the six flows as **`.webm`** (mp4 conversion pending `ffmpeg`) |
| 5 | Eval summary (triage accuracy, citation coverage, unsafe‑action blocking, escalation) | ✅ Done — all four **100%** |

---

## 6. Beyond the brief — extras shipped

- **Dual purchase vs registration dates** — separate `purchase_date` (time‑rule anchor) and `registered_at`; migration + both dates surfaced in both portals.
- **One registration per product, per customer** — partial unique index (race‑safe) + friendly "Already registered" chip in the picker.
- **Customer‑facing knowledge base** — a **Warranty & Policy Info** page and **clickable citation chips** that open a popover; KB rewritten in plain, non‑technical language for customers (agent/eval text kept intact). Adversarial doc never exposed.
- **WhatsApp‑style agent workspace** — unified conversation panel + reply composer (Generate draft / Send).
- **Read‑only closed/resolved tickets** — enforced in the **UI and server‑side** (409 on every mutating endpoint); only reopening is allowed.
- **Glassmorphic 2026 UI**, INR currency, multi‑turn conversation + email lifecycle, product/order self‑registration, draft editing with audit trail.
- **Deploy hardening** — Render blueprint fix (pinned `VITE_API_URL`), a **mock‑only Docker compose** fallback, dotenv wiring, and provider auto‑fallback.

## 7. Known limitations / pending

- **Explainer video is `.webm`**, not `.mp4` (needs `ffmpeg`).
- **`main` is behind** the feature branch — merge the open PR to update the public default branch.
- **RBAC** is role‑aware but the approve step isn't role‑restricted (good‑to‑have).
- **PII redaction** covers identity‑bypass/account‑detail paths; no blanket output redactor.
- **Priority accuracy** (supplementary metric) is 71.4% on the mock for escalation‑edge cases — not one of the required metrics.

## 8. Assumptions / deviations

- The brief's actual data files weren't provided, so **synthetic seed data** is used — with **KB/tool/eval IDs kept verbatim** so evals bind correctly.
- **Coupon creation** is deliberately blocked (guardrailed), not offered as a tool.
- Currency is shown in **INR (₹)** (brief is currency‑agnostic).

---

### Bottom line
All **Must‑Have** workflow items and technical requirements are implemented and verified, the four required eval metrics are **100%**, and the project exceeds the brief in several areas. The only genuinely open deliverable item is converting the explainer recordings from `.webm` to `.mp4`; the public repo would also benefit from merging the feature branch into `main`.
