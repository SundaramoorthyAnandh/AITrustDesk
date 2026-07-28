# Deploying TrustDesk to Render (free tier)

This deploys **three free services** from one Blueprint ([`render.yaml`](render.yaml)):

| Service | Type | What |
| --- | --- | --- |
| `trustdesk-api` | Node web service | Fastify API + SQLite |
| `trustdesk-customer` | Static site | Customer Complaint Portal |
| `trustdesk-agent` | Static site | Agent Console |

Everything is free, and there's **no manual URL wiring**: the static sites receive the API host via
`fromService`, and the API's CORS allows any `*.onrender.com` origin.

## What "free tier" means here (by design)
- **Ephemeral data.** Free instances have no persistent disk, so `SEED_ON_BOOT=true` reseeds the
  database on every start. Every cold start gives a **clean, fully-seeded demo**; anything a visitor
  creates during a session is discarded when the API sleeps or redeploys. (For durable data, swap
  SQLite for Turso/libSQL or add a paid disk — see [STRETCH.md](STRETCH.md).)
- **Cold starts.** The free API sleeps after ~15 min idle; the first request then takes ~30–60s to
  wake (it also reseeds on wake). The static portals are on a CDN and never sleep.

## Prerequisites
1. A **GitHub** (or GitLab) account.
2. A **Render** account (sign up free at render.com).
3. This repo pushed to GitHub — see below.

## Step 1 — Push the repo to GitHub
An initial commit already exists locally. Create an empty GitHub repo, then:

```bash
git remote add origin https://github.com/<you>/trustdesk.git
git branch -M main
git push -u origin main
```

(or with the GitHub CLI: `gh repo create trustdesk --private --source=. --push`)

## Step 2 — Deploy the Blueprint on Render
1. Render Dashboard → **New** → **Blueprint**.
2. Connect your GitHub and pick the `trustdesk` repo. Render reads `render.yaml`.
3. Review the three services (all **Free**) and click **Apply**.
4. Wait for the first build. The API's JWT secrets are auto-generated; `SEED_ON_BOOT` seeds on start.

## Step 3 — Use it
- **Customer portal:** `https://trustdesk-customer.onrender.com`
- **Agent console:** `https://trustdesk-agent.onrender.com`
- **API health:** `https://trustdesk-api.onrender.com/health`

(Exact URLs appear on each service's page; if a name was taken globally Render adds a suffix.)

### Demo logins — password `Password123!`
- Customer: `alice.johnson@example.com` (or self-register)
- Agent: `agent@trustdesk.io` · Supervisor: `supervisor@trustdesk.io`

> First load after idle is slow (API cold start). Hit the API health URL once to wake it, then use
> the portals.

## Notes / troubleshooting
- **CORS:** allowed origins are `https://*.onrender.com` (set via `CORS_ORIGINS`). To lock down to the
  exact portal URLs, edit that env var on `trustdesk-api`.
- **Real LLM instead of mock:** set `LLM_PROVIDER=langchain` + `OPENAI_BASE_URL` / `OPENAI_API_KEY` /
  `MODEL_NAME` on `trustdesk-api` to point at a hosted OpenAI-compatible endpoint (LM Studio on your
  laptop is not reachable from Render).
- **Auto-deploy:** pushing to `main` redeploys all three services.
- **Persistence:** if you later want visitor data to survive restarts on free tier, migrate the store
  to Turso/libSQL (Drizzle supports it) and set `SEED_ON_BOOT=false`.
