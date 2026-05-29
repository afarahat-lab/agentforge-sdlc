# Quick Start — Gestalt

Get Gestalt running on your machine in under 15 minutes.

---

## Overview

Gestalt has two distinct roles:

| Role | What it is | Who runs it |
|---|---|---|
| **Server** | The platform — runs Docker, hosts the database, queue, and API | Runs once on a server (or your local machine for testing) |
| **CLI** | Developer tool — submits intents, checks status | Installed on every developer's machine |

For local testing, your machine plays both roles.

---

## Part 1 — Server setup (run once)

### Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Docker Desktop | 4.25+ | [Download here](https://www.docker.com/products/docker-desktop/) — must be **running** before any docker command |
| Git | 2.38+ | |
| LLM endpoint | — | Azure OpenAI, Ollama, or any OpenAI-compatible API |

> **macOS / Windows:** Open Docker Desktop and wait for the whale icon in the menu bar to stop animating before proceeding.

### Step 1 — Clone the repository

```bash
git clone https://github.com/afarahat-lab/gestalt.git
cd gestalt
```

### Step 2 — Configure environment

```bash
cp .env.example .env
```

Open `.env` and fill in the required values:

```bash
# LLM provider — choose one:

# Azure OpenAI
LLM_BASE_URL=https://<resource>.openai.azure.com/openai/deployments/<deployment>
LLM_API_KEY=<your-api-key>
LLM_MODEL=gpt-4o

# Ollama (local, no API key needed)
LLM_BASE_URL=http://host.docker.internal:11434/v1
LLM_API_KEY=ollama
LLM_MODEL=llama3

# Required
POSTGRES_PASSWORD=choose-a-strong-password
JWT_SECRET=choose-a-64-character-random-string
SERVER_BASE_URL=http://localhost:3000

# Required for local auth (development / first boot only)
NODE_ENV=development
```

Generate a secure JWT secret:
```bash
openssl rand -hex 64
```

### Step 3 — Start the platform

```bash
docker-compose up -d
```

Verify all three containers are healthy:
```bash
docker-compose ps
# agentforge-server    Up (healthy)
# agentforge-postgres  Up (healthy)
# agentforge-redis     Up (healthy)
```

Confirm the server is responding:
```bash
curl http://localhost:3000/health
# {"status":"ok","version":"0.0.0"}
```

### Step 4 — Create the first admin user

This step is run **once** after the first `docker-compose up`. It creates the platform admin account.

```bash
gestalt init-admin
```

You will be prompted for:
- Email address
- Display name
- Password (minimum 8 characters, hidden input)
- Confirm password

On success you will see:
```
✓ Admin user created. You are now signed in as admin@company.com.
```

> If you see `403 ADMIN_ALREADY_EXISTS`, an admin already exists.
> Run `gestalt login` instead. See [common issues](../runbooks/common-issues.md#admin-setup) if you need to reset.

---

## Part 2 — CLI setup (run once per developer machine)

The CLI is not published to npm. It is built from the repo and linked globally.

### Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | 20+ | |
| pnpm | 9.x | `npm install -g pnpm@9.15.4` — do not use pnpm 10+ |

### Step 5 — Build and install the CLI

```bash
# From the gestalt repo root
pnpm install
pnpm --filter @gestalt/cli build
cd packages/cli && npm link && cd ../..
```

Verify:
```bash
gestalt --version
gestalt --help
```

### Step 6 — Sign in

```bash
gestalt login
# Server: http://localhost:3000
# Enter your admin email and password
```

---

## Part 3 — Project setup (run once per project)

### Step 7 — Create a project folder

```bash
mkdir my-project
cd my-project
```

### Step 8 — Initialise the project

```bash
gestalt init
```

The initializer will:
1. Confirm your LLM connection
2. Ask you to describe your project in natural language
3. Extract a structured spec and confirm it with you
4. Generate all harness files in your project folder:
   - `AGENTS.md` — agent orientation
   - `HARNESS.json` — project configuration
   - `docs/ARCHITECTURE.md`, `docs/DOMAIN.md`, `docs/GOLDEN_PRINCIPLES.md`, `docs/DECISIONS.md`
5. Validate the harness and report ready

---

## Part 4 — Daily use

### Step 9 — Submit your first intent

From inside your project folder:

```bash
gestalt run "Set up the initial project scaffold with folder structure"
```

Watch live agent activity:
```bash
gestalt logs
```

Check status:
```bash
gestalt status
```

Open the dashboard:
```bash
gestalt dashboard
# Opens http://localhost:3000 in your browser
```

---

## Summary — command reference

| Command | When | Purpose |
|---|---|---|
| `docker-compose up -d` | Once (server) | Start the platform |
| `gestalt init-admin` | Once (server) | Create first admin user |
| `gestalt login` | Each machine | Authenticate the CLI |
| `gestalt init` | Once per project | Set up a project harness |
| `gestalt run "<intent>"` | Daily | Submit work to agents |
| `gestalt status` | Daily | Check platform and intent status |
| `gestalt logs` | Daily | Stream live agent activity |
| `gestalt dashboard` | Daily | Open oversight dashboard |

---

## Next steps

- [Development setup](./running.md) — running Gestalt from source for contributors
- [Deployment guide](./deployment.md) — production install for corporate IT
- [Identity integration](./identity/overview.md) — connect to your corporate IdP
- [HARNESS.json reference](../reference/harness-config.md) — full configuration reference
- [Common issues](../runbooks/common-issues.md) — troubleshooting
