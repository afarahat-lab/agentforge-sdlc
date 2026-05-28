# Running Gestalt

This guide covers all three ways to run the platform depending on your goal.

---

## Option 1 — Docker (recommended for end users and evaluators)

The fastest way to get a running platform. No Node.js required.

### Prerequisites

- Docker Engine 24.0+
- Docker Compose 2.20+
- Git

### Steps

```bash
# 1. Clone
git clone https://github.com/afarahat-lab/gestalt.git
cd gestalt

# 2. Configure environment
cp .env.example .env
```

Open `.env` and fill in the required values:

```bash
# Your LLM provider (choose one):

# Azure OpenAI
LLM_BASE_URL=https://<resource>.openai.azure.com/openai/deployments/<deployment>
LLM_API_KEY=<your-api-key>
LLM_MODEL=gpt-4o

# Ollama (local — no API key needed)
LLM_BASE_URL=http://host.docker.internal:11434/v1
LLM_API_KEY=ollama
LLM_MODEL=llama3

# Required — change these
POSTGRES_PASSWORD=choose-a-strong-password
JWT_SECRET=choose-a-64-character-random-string
SERVER_BASE_URL=http://localhost:3000
```

```bash
# 3. Start all services
docker-compose up -d

# 4. Verify all three containers are healthy
docker-compose ps
# agentforge-server    running (healthy)
# agentforge-postgres  running (healthy)
# agentforge-redis     running (healthy)

# 5. Install the CLI
npm install -g @gestalt/cli

# 6. Create your first admin user
agentforge init local-admin

# 7. Open the dashboard
open http://localhost:3000
# Or run: agentforge dashboard
```

### Verify it's working

```bash
# Health check
curl http://localhost:3000/health
# Expected: {"status":"ok","version":"0.1.0"}

# CLI status
agentforge status
```

### Stop

```bash
docker-compose down        # stop (keeps data)
docker-compose down -v     # stop and delete all data
```

---

## Option 2 — Development mode (for contributors and active development)

Runs each package in watch mode so changes reload instantly.

### Prerequisites

- Node.js 20+
- pnpm 9+ (`npm install -g pnpm`)
- Docker (for PostgreSQL and Redis)

### Steps

```bash
# 1. Clone and install
git clone https://github.com/afarahat-lab/gestalt.git
cd gestalt
pnpm install

# 2. Start infrastructure (PostgreSQL + Redis only)
docker-compose up -d postgres redis

# 3. Configure environment
cp .env.example .env
# Fill in LLM_BASE_URL, LLM_API_KEY, LLM_MODEL, POSTGRES_PASSWORD, JWT_SECRET
# DATABASE_URL will be: postgresql://gestalt:<POSTGRES_PASSWORD>@localhost:5432/gestalt
# Add: DATABASE_URL=postgresql://gestalt:<your-password>@localhost:5432/gestalt

# 4. Build core packages (required before running)
pnpm --filter @gestalt/core build
pnpm --filter @gestalt/adapter-postgres build

# 5. Start the server (terminal 1)
cd packages/server
pnpm dev
# Server running on http://localhost:3000

# 6. Start the dashboard (terminal 2)
cd packages/dashboard
pnpm dev
# Dashboard dev server on http://localhost:5173 (proxies API to :3000)

# 7. Use the CLI (terminal 3)
cd packages/cli
pnpm dev -- login
# Or build and use globally:
pnpm build
npm link
gestalt login
```

### Watch mode for all packages simultaneously

```bash
# From repo root — starts all packages in watch mode
pnpm dev
```

### Run tests

```bash
# All packages
pnpm test

# Specific package
pnpm --filter @gestalt/core test
pnpm --filter @gestalt/agents-generate test

# Watch mode
pnpm --filter @gestalt/core test -- --watch
```

### Type check all packages

```bash
pnpm typecheck
```

### Build all packages for production

```bash
pnpm build
# Outputs: packages/*/dist/
# Dashboard: packages/dashboard/dist/
```

---

## Option 3 — CLI only (connect to existing server)

If a Gestalt server is already running in your organisation, install only the CLI.

```bash
# Install CLI globally
npm install -g @gestalt/cli

# Point at your server
gestalt login --server https://gestalt.company.com

# Initialise a project
gestalt init

# Submit an intent
gestalt run "Add a leave request approval workflow"

# Watch agent progress
gestalt status
```

---

## Common workflows

### Submit your first intent

```bash
# After login and init:
gestalt run "Set up the initial project scaffold with folder structure"

# Watch live agent activity
gestalt logs

# Check status
gestalt status

# Open dashboard for full detail
gestalt dashboard
```

### View intent detail

```bash
# From CLI
gestalt status --id <correlationId>

# From dashboard
# Navigate to: http://localhost:3000 → click any intent
```

### Provide clarification when agents ask

When an intent is ambiguous, the platform pauses and waits.

```bash
# CLI shows: "Status: ? needs clarification"
# Open the dashboard → Alerts view → provide clarification
# Or via CLI:
gestalt status --id <correlationId>
# Follow the prompt to enter clarification
```

### Trigger a maintenance run manually

```bash
# From dashboard: Maintenance → "run now" button next to any agent

# From CLI (admin required):
# gestalt maintenance trigger --agent drift-agent
```

---

## Environment variables reference

| Variable | Required | Description |
|---|---|---|
| `LLM_BASE_URL` | Yes | LLM provider endpoint |
| `LLM_API_KEY` | Yes | LLM API key |
| `LLM_MODEL` | Yes | Model name (e.g. `gpt-4o`, `llama3`) |
| `POSTGRES_PASSWORD` | Yes | PostgreSQL password |
| `JWT_SECRET` | Yes | JWT signing secret (64+ random chars) |
| `SERVER_BASE_URL` | Yes | Public URL of the server |
| `DATABASE_URL` | Dev only | Full Postgres connection string |
| `REDIS_URL` | No | Redis URL (default: `redis://localhost:6379`) |
| `SERVER_PORT` | No | Server port (default: `3000`) |
| `NODE_ENV` | No | `development` or `production` |
| `LOG_LEVEL` | No | `debug`, `info`, `warn`, `error` (default: `info`) |
| `LLM_TIMEOUT_MS` | No | LLM request timeout (default: `120000`) |
| `SESSION_TTL_MINUTES` | No | JWT session duration (default: `480`) |

---

## Troubleshooting

### Server won't start — missing environment variables

```
GestaltConfigError: Missing required environment variables:
  - LLM_BASE_URL
  - JWT_SECRET
```

Copy `.env.example` to `.env` and fill in all required values.

### Cannot connect to LLM

```bash
# Test from the container
docker-compose exec server curl -I $LLM_BASE_URL
# If connection refused: check LLM_BASE_URL in .env
# If 401: check LLM_API_KEY
# If timeout: check firewall / proxy settings
```

### Database migration fails

```bash
# Check PostgreSQL is running and healthy
docker-compose ps postgres

# Check credentials
docker-compose logs postgres | grep "error"

# If password mismatch after changing .env, destroy and recreate volume
docker-compose down -v
docker-compose up -d
```

### CLI: "Not authenticated"

```bash
gestalt login --server http://localhost:3000
```

### Dashboard blank / not loading

```bash
# Check server is running
curl http://localhost:3000/health

# In dev mode: ensure dashboard dev server is proxying correctly
# vite.config.ts proxy should point to http://localhost:3000
```

For more issues: [Operations Runbook](./runbooks/common-issues.md)

---

## Related guides

- [Quick Start](./quick-start.md) — 10-minute Docker setup
- [Deployment Guide](./deployment.md) — production corporate installation
- [Identity Integration](./identity/overview.md) — connect to your corporate IdP
- [Configuration Reference](../reference/harness-config.md) — all HARNESS.json options
