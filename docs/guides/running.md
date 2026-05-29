# Development Setup — Gestalt

This guide covers running Gestalt from source for contributors and active development.

For the standard setup (Docker), see [Quick Start](./quick-start.md).
For production corporate deployment, see [Deployment Guide](./deployment.md).

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | 20+ | |
| pnpm | 9.x | `npm install -g pnpm@9.15.4` — pnpm 10+ requires Node 22, do not use it |
| Docker Desktop | 4.25+ | For PostgreSQL and Redis only — must be running |
| Git | 2.38+ | |

---

## Step 1 — Clone and install

```bash
git clone https://github.com/afarahat-lab/gestalt.git
cd gestalt
pnpm install
```

---

## Step 2 — Start infrastructure

Run only PostgreSQL and Redis in Docker. The server and dashboard run as Node processes.

```bash
docker-compose up -d postgres redis

docker-compose ps postgres redis
# Both should show Up (healthy)
```

---

## Step 3 — Configure environment

```bash
cp .env.example .env
```

Add these values to `.env`:

```bash
# Required
LLM_BASE_URL=<your-llm-endpoint>
LLM_API_KEY=<your-api-key>
LLM_MODEL=gpt-4o
JWT_SECRET=<64-character-random-string>
NODE_ENV=development          # required — enables local auth provider

# Database (matches docker-compose postgres defaults)
POSTGRES_PASSWORD=<your-password>
DATABASE_URL=postgresql://gestalt:<your-password>@localhost:5432/gestalt
```

Generate a JWT secret:
```bash
openssl rand -hex 64
```

---

## Step 4 — Build core packages

Build once before starting the server:

```bash
pnpm --filter @gestalt/core build
pnpm --filter @gestalt/adapter-postgres build
```

---

## Step 5 — Run in development mode

Open three terminals.

**Terminal 1 — Server:**
```bash
cd packages/server
pnpm dev
# Server running on http://localhost:3000
```

**Terminal 2 — Dashboard (optional):**
```bash
cd packages/dashboard
pnpm dev
# Dashboard on http://localhost:5173 (proxies API to :3000)
```

**Terminal 3 — CLI:**
```bash
pnpm --filter @gestalt/cli build
cd packages/cli && npm link && cd ../..
gestalt init-admin       # first time only
gestalt login
```

---

## Common build commands

```bash
# Build all packages in dependency order
pnpm build

# Type check all packages
pnpm typecheck

# Run all tests
pnpm test

# Test a specific package
pnpm --filter @gestalt/core test

# Clean all build outputs
pnpm clean
```

---

## Package build order

When making changes, rebuild affected packages in this order:

```
@gestalt/core
  └── @gestalt/adapter-postgres
  └── @gestalt/agents-generate
  └── @gestalt/agents-quality-gate
  └── @gestalt/agents-deploy
  └── @gestalt/agents-maintenance
        └── @gestalt/server
              └── @gestalt/cli
```

`@gestalt/dashboard` has no internal package dependencies — it only calls the server API.

---

## Troubleshooting

**`Cannot find module '@gestalt/core'`**
```bash
pnpm --filter @gestalt/core build
pnpm --filter @gestalt/adapter-postgres build
```

**`dial unix /var/run/docker.sock: no such file or directory`**

Docker Desktop is not running. Open it and wait for the whale icon to stop animating.

**`Database connection refused`**
```bash
docker-compose ps postgres    # check it's healthy
# Verify DATABASE_URL matches POSTGRES_PASSWORD in .env
```

**Port 3000 already in use**
```bash
lsof -ti:3000 | xargs kill
# Or set SERVER_PORT=3001 in .env
```

**Local auth not working / `LocalProvider not registered`**

`NODE_ENV=development` must be set in `.env`. Local auth is disabled in production by design (ADR-025).

For more issues: [Common issues runbook](../runbooks/common-issues.md)
