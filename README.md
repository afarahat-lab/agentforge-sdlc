# Gestalt

An open-source, self-hosted agent-first platform that automates the full Software Development Lifecycle for corporate operations web and mobile applications.

Gestalt replaces manual development cycles with a closed-loop system of specialised AI agents — handling design, code generation, quality enforcement, deployment, and continuous maintenance — while keeping humans in strategic control.

---

## What it does

```
You write:   "Add a leave request approval workflow with manager and HR stages"
Agents do:   Design → Context → Code → Tests → Review → Deploy → Maintain
You see:     A dashboard showing every decision, signal, and outcome
```

### SDLC coverage

| Phase | Gestalt capability |
|---|---|
| Requirements | Intent capture → structured spec |
| Architecture | Harness initializer generates architecture from project context |
| Design | Domain model, API contracts, component specs |
| Development | TypeScript code within harness constraints |
| Testing | Tests generated from success criteria |
| Code review | Architectural constraint enforcement |
| Security | OWASP ruleset on every change |
| Deployment | PR, CI/CD pipeline, environment promotion |
| Maintenance | Background agents — doc drift, arch realignment, GC |
| Monitoring | Evaluation agents analyse metrics, queue fixes |

---

## Getting started

```bash
git clone https://github.com/afarahat-lab/gestalt.git
cd gestalt
cp .env.example .env   # fill in LLM and database credentials
docker-compose up -d

# Install the CLI from the local workspace (not published to npm)
pnpm install
pnpm --filter @gestalt/cli build
cd packages/cli && npm link && cd ../..

gestalt init local-admin
open http://localhost:3000
```

See **[docs/guides/quick-start.md](docs/guides/quick-start.md)** for the full step-by-step walkthrough including LLM provider options, health checks, and first intent submission.

---

## Architecture

```
Human intent
     │
     ▼
Generate layer        (design · context · code · tests)
     │
     ▼
Quality gate layer    (constraints · lint · tests · security)
     │
     ▼
Merge & deploy layer  (PR · CI/CD · environment promotion)
     │
     ▼
Maintenance layer     (drift · alignment · GC · evaluation)
     │
     ▼
Human oversight       (dashboard · alerts · intervention)
```

---

## Repository structure

```
gestalt/
├── packages/
│   ├── core/              # harness engine, LLM, queue, repository
│   ├── cli/               # gestalt CLI tool
│   ├── server/            # Fastify server + auth + oversight API
│   ├── dashboard/         # React oversight dashboard
│   ├── agents/
│   │   ├── generate/      # intent, design, context, code, test agents
│   │   ├── quality-gate/  # lint, security, constraint, test-runner, review
│   │   ├── deploy/        # PR, pipeline, promotion agents
│   │   └── maintenance/   # drift, alignment, GC, evaluation agents
│   └── adapters/
│       ├── postgres/      # PostgreSQL adapter (default)
│       ├── oracle/        # Oracle adapter
│       └── mssql/         # SQL Server adapter
├── templates/
│   └── corporate-ops-web-mobile/   # Tier 1 standard library harness
├── docs/
│   ├── guides/            # how-to guides by audience
│   ├── reference/         # configuration reference
│   ├── runbooks/          # operations and troubleshooting
│   └── ARCHITECTURE.md
├── AGENTS.md              # agent orientation for this repo
├── HARNESS.json
├── docker-compose.yml
└── .env.example
```

---

## Platform decisions

| Concern | Decision |
|---|---|
| Runtime | Self-hosted server |
| Developer interface | CLI (`gestalt` command) |
| Agent model | Ephemeral workers (BullMQ + Redis) |
| Primary database | PostgreSQL — Oracle and SQL Server adapters available |
| LLM provider | Configurable: Azure OpenAI · Ollama · vLLM |
| Authentication | Windows Kerberos · SAML 2.0 · OIDC · local fallback |
| Frontend | React 18 + Vite |
| Backend | Node.js 20 / TypeScript / Fastify |

---

## Documentation

| Guide | Audience |
|---|---|
| [Quick start](docs/guides/quick-start.md) | First-time users — Docker in 10 minutes |
| [Development setup](docs/guides/running.md) | Contributors — running from source |
| [Deployment guide](docs/guides/deployment.md) | Corporate IT — production install |
| [Identity integration](docs/guides/identity/overview.md) | IT admins — Kerberos, SAML, Azure AD |
| [HARNESS.json reference](docs/reference/harness-config.md) | Operators — full config reference |
| [Operations runbook](docs/runbooks/common-issues.md) | Operators — troubleshooting |
| [Architecture](docs/ARCHITECTURE.md) | Contributors — system design |
| [Architecture decisions](docs/DECISIONS.md) | Contributors — all ADRs |

---

## Contributing

Gestalt uses a three-tier harness registry:

- **Tier 1 — Standard library**: ships with the platform, curated by maintainers
- **Tier 2 — Verified registry**: community-contributed, reviewed and badged
- **Tier 3 — Community registry**: open contributions, experimental

See the registry documentation for contributing harness patterns and adapters.

---

## License

MIT
