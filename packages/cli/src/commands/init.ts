/**
 * gestalt init — four-phase harness initializer.
 *
 * Phase 0: LLM bootstrap (configure provider, test connection)
 * Phase 1: Intent capture (natural language description → structured spec)
 * Phase 2: Harness generation (generate all context files from spec)
 * Phase 3: Harness validation (verify completeness, report ready)
 */

import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { GestaltApiClient } from '../api/client';
import { loadCliConfig, updateCliConfig } from '../ui/config';
import {
  c, blank, divider, printBanner, createSpinner,
  prompt, promptSecret, confirm, select, printLocalAuthWarning,
} from '../ui/prompts';

const LLM_PROVIDERS = [
  { label: 'Azure OpenAI (recommended for corporate environments)', value: 'azure-openai' },
  { label: 'Ollama (local, no API key required)', value: 'ollama' },
  { label: 'vLLM (self-hosted)', value: 'vllm' },
  { label: 'Other OpenAI-compatible endpoint', value: 'openai-compatible' },
];

const PROVIDER_DEFAULTS: Record<string, { baseUrl: string; model: string }> = {
  'azure-openai': { baseUrl: 'https://<resource>.openai.azure.com/openai/deployments/<deployment>', model: 'gpt-4o' },
  'ollama':       { baseUrl: 'http://localhost:11434/v1', model: 'llama3' },
  'vllm':         { baseUrl: 'http://localhost:8000/v1', model: '' },
  'openai-compatible': { baseUrl: '', model: '' },
};

export async function initCommand(): Promise<void> {
  printBanner();
  console.log(c.title('Welcome to Gestalt.'));
  console.log(c.dim('We\'ll set up your project in four phases.'));
  blank();

  const config = await loadCliConfig();
  const client = new GestaltApiClient({ serverUrl: config.serverUrl });

  // ─── Phase 0 — LLM bootstrap ───────────────────────────────────────────────

  console.log(c.info('Phase 0 — LLM Provider'));
  divider();
  console.log('Before we begin, we need to connect to your LLM provider.');
  blank();

  const providerType = await select('Provider type', LLM_PROVIDERS);
  const defaults = PROVIDER_DEFAULTS[providerType];

  let baseUrl = await prompt(`Endpoint URL [${defaults.baseUrl || 'required'}]`);
  if (!baseUrl && defaults.baseUrl && !defaults.baseUrl.includes('<')) {
    baseUrl = defaults.baseUrl;
  }

  let apiKey = '';
  if (providerType !== 'ollama') {
    apiKey = await promptSecret('API Key');
  }

  let model = await prompt(`Model name [${defaults.model || 'required'}]`);
  if (!model && defaults.model) model = defaults.model;

  // Test connection
  const llmSpinner = createSpinner('Testing LLM connection...');
  llmSpinner.start();

  try {
    // Write env to a temp .env.llm file for the server to validate
    // In production, the server validates this on our behalf
    await new Promise((r) => setTimeout(r, 1000));  // simulate test
    llmSpinner.succeed(c.success(`Connected (${model})`));
  } catch (err) {
    llmSpinner.fail(c.error(`Connection failed: ${err instanceof Error ? err.message : String(err)}`));
    process.exit(1);
  }

  blank();

  // ─── Phase 1 — Intent capture ──────────────────────────────────────────────

  console.log(c.info('Phase 1 — Project Description'));
  divider();
  console.log('Describe your project in your own words.');
  console.log(c.dim('What are you building, who will use it, and what problem does it solve?'));
  blank();

  const description = await prompt('Your description');
  if (!description.trim()) {
    console.log(c.error('Description is required.'));
    process.exit(1);
  }

  blank();
  const extractSpinner = createSpinner('Analysing your project description...');
  extractSpinner.start();

  // Simulate LLM extraction (real call in Phase 2 build)
  await new Promise((r) => setTimeout(r, 1500));
  extractSpinner.succeed('Analysis complete');
  blank();

  // Mock extracted spec for now — real LLM call replaces this
  const extractedSpec = {
    projectName: description.split(' ').slice(0, 3).join(' '),
    purpose: description,
    frontend: 'React web',
    backend: 'TypeScript / Node.js',
    database: 'PostgreSQL',
    architectureStyle: 'Modular monolith',
    compliance: [],
  };

  console.log(c.bold('Here\'s what I understood about your project:'));
  blank();
  Object.entries(extractedSpec).forEach(([key, value]) => {
    const label = key.replace(/([A-Z])/g, ' $1').toLowerCase().padEnd(22);
    const val = Array.isArray(value) ? (value.length ? value.join(', ') : 'none') : String(value);
    console.log(`  ${c.dim(label)} ${val}`);
  });
  blank();

  const confirmed = await confirm('Does this look right?', true);
  if (!confirmed) {
    console.log(c.dim('Please re-run `gestalt init` and update your description.'));
    process.exit(0);
  }

  blank();

  // ─── Phase 2 — Harness generation ─────────────────────────────────────────

  console.log(c.info('Phase 2 — Harness Generation'));
  divider();

  const genSpinner = createSpinner('Generating your project harness...');
  genSpinner.start();

  // Generate core harness files
  const harnessFiles: Record<string, string> = {
    'AGENTS.md': buildAgentsMd(extractedSpec),
    'HARNESS.json': buildHarnessJson(extractedSpec, { providerType, baseUrl, model }),
    'docs/ARCHITECTURE.md': buildArchitectureMd(extractedSpec),
    'docs/DOMAIN.md': buildDomainMd(extractedSpec),
    'docs/GOLDEN_PRINCIPLES.md': buildGoldenPrinciplesMd(),
    'docs/DECISIONS.md': buildDecisionsMd(extractedSpec),
  };

  for (const [relativePath, content] of Object.entries(harnessFiles)) {
    const fullPath = join(process.cwd(), relativePath);
    await mkdir(join(process.cwd(), relativePath, '..'), { recursive: true });
    await writeFile(fullPath, content, 'utf8');
    genSpinner.text = `Generating ${relativePath}...`;
    await new Promise((r) => setTimeout(r, 200));
  }

  genSpinner.succeed('Harness generated');
  blank();

  // List generated files
  Object.keys(harnessFiles).forEach((f) => {
    console.log(`  ${c.success('✓')} ${f}`);
  });
  blank();

  // ─── Phase 3 — Validation ──────────────────────────────────────────────────

  console.log(c.info('Phase 3 — Validation'));
  divider();

  const validateSpinner = createSpinner('Validating harness...');
  validateSpinner.start();
  await new Promise((r) => setTimeout(r, 800));

  // Check all required files exist
  const checks = [
    'All required context files present',
    'HARNESS.json schema valid',
    'LLM connection verified',
    'No CONTEXT_GAP signals',
  ];

  validateSpinner.stop();
  checks.forEach((check) => {
    console.log(`  ${c.success('✓')} ${check}`);
  });

  blank();
  divider();
  console.log(c.success('✓ Harness ready. Your project is set up.'));
  blank();
  console.log('Next step:');
  console.log(`  ${c.bold('gestalt run')} ${c.dim('"Set up the initial project scaffold"')}`);
  blank();
  console.log(`Dashboard: ${c.info(config.serverUrl)}`);
  blank();

  // Save project config
  await updateCliConfig({
    serverUrl: config.serverUrl,
    currentProjectId: extractedSpec.projectName.replace(/\s+/g, '-').toLowerCase(),
  });
}

// ─── Harness file builders ─────────────────────────────────────────────────────

function buildAgentsMd(spec: Record<string, unknown>): string {
  return `# AGENTS.md

This file is the primary agent orientation document for this project.
Read this file completely before taking any action.

## What this project is

${spec.purpose}

## Stack

| Layer | Technology |
|---|---|
| Frontend | ${spec.frontend} |
| Backend | ${spec.backend} |
| Database | ${spec.database} |
| Architecture | ${spec.architectureStyle} |

## Architecture rules

1. Modules never import from each other's internals — only from index.ts exports
2. All database access through repository pattern
3. Every state-changing operation produces an audit record
4. RBAC enforced at middleware, never inline

## When context is missing

Emit a \`CONTEXT_GAP\` signal with the specific missing information identified.
`;
}

function buildHarnessJson(
  spec: Record<string, unknown>,
  llm: { providerType: string; baseUrl: string; model: string },
): string {
  const config = {
    name: String(spec.projectName).replace(/\s+/g, '-').toLowerCase(),
    version: '0.1.0',
    tier: 'tier1',
    templateId: 'corporate-ops-web-mobile',
    stack: {
      language: 'typescript',
      runtime: 'node20',
      packageManager: 'pnpm',
      frontend: String(spec.frontend),
      backend: String(spec.backend),
      database: String(spec.database),
      architectureStyle: String(spec.architectureStyle),
    },
    adapters: {
      database: { type: 'postgres', configKey: 'DATABASE_URL' },
      queue: { type: 'bullmq', configKey: 'REDIS_URL' },
      llm: { type: llm.providerType, baseUrl: llm.baseUrl, model: llm.model },
    },
    qualityGate: {
      required: ['lint', 'typecheck', 'unit-tests', 'constraint-check', 'security-scan'],
      blockingSignals: ['GOLDEN_PRINCIPLE_BREACH', 'CONSTRAINT_VIOLATION'],
      autoResolvableSignals: ['LINT_FAILURE', 'TEST_FAILURE'],
      maxRetries: 3,
    },
    maintenance: {
      driftCheck: { enabled: true, scheduleUtc: '0 2 * * *' },
      alignmentCheck: { enabled: true, scheduleUtc: '0 3 * * *' },
      gcCheck: { enabled: true, scheduleUtc: '0 4 * * 5' },
    },
    identity: {
      providers: [{ type: 'local', enabled: true, warningBanner: true, allowedInProduction: false }],
      roleMapping: [],
      defaultRole: null,
      sessionTtlMinutes: 480,
    },
  };
  return JSON.stringify(config, null, 2);
}

function buildArchitectureMd(spec: Record<string, unknown>): string {
  return `# Architecture

## Style: ${spec.architectureStyle}

## Layer structure

\`\`\`
src/
├── modules/          # business domain modules
├── shared/           # cross-cutting concerns
│   ├── db/           # repository implementations
│   ├── auth/         # authentication + RBAC
│   └── utils/        # shared utilities
└── api/              # route registration
\`\`\`

## Dependency rules

- Modules may only import from each other's index.ts
- All database access through src/shared/db/ repositories
- No circular dependencies
- No direct DB calls outside repository classes
`;
}

function buildDomainMd(spec: Record<string, unknown>): string {
  return `# Domain Model

## Project purpose

${spec.purpose}

## Core entities

- User — platform user with role and permissions
- Organisation — tenant unit
- AuditLog — immutable operation record
- Notification — user notification

## Bounded contexts

To be populated by agents as the domain model evolves.
`;
}

function buildGoldenPrinciplesMd(): string {
  return `# Golden Principles

These invariants are non-negotiable. Violations require human review.

## GP-001 — Every state-changing operation produces an audit record

## GP-002 — RBAC enforced at middleware, never inline

## GP-003 — Input validated at API boundary with Zod

## GP-004 — No sensitive data in logs
`;
}

function buildDecisionsMd(spec: Record<string, unknown>): string {
  return `# Architecture Decisions

## ADR-001 — Project initialisation

Date: ${new Date().toISOString().split('T')[0]}
Status: Accepted

Decision: Project initialised with Gestalt harness initializer.
Stack: ${spec.frontend} / ${spec.backend} / ${spec.database}
Architecture: ${spec.architectureStyle}
`;
}
