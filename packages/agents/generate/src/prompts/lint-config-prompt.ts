/**
 * LLM prompt builder for the lint-config agent.
 * Updates ESLint constraint rules for new module boundaries.
 */

import type { ContextSnapshot } from '../types';

export function buildLintConfigPrompt(ctx: ContextSnapshot, _attempt: number): string {
  return `You are the lint-config agent in the Gestalt platform.
Update the ESLint configuration to enforce boundaries for new modules.

## New domain changes

${ctx.priorArtifacts.find((a) => a.path === '.gestalt/design-spec.json')?.content ?? '{}'}

## Current architecture

${ctx.architectureMd.slice(0, 1000)}

Generate updated ESLint rules as JSON. Return { "rules": { ... } } only.
`;
}
