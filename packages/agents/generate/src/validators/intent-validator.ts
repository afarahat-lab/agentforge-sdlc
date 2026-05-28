/**
 * Intent spec validator — structural checks before the spec leaves intent-agent.
 */
import type { IntentSpec } from '../types';

export function validateIntentSpec(spec: IntentSpec): void {
  if (!spec.id) throw new Error('IntentSpec missing id');
  if (!spec.correlationId) throw new Error('IntentSpec missing correlationId');
  if (!spec.rawIntent?.trim()) throw new Error('IntentSpec missing rawIntent');
  if (!spec.scope.affectedDomains.length) throw new Error('IntentSpec has no affectedDomains');
  if (!spec.successCriteria.length) throw new Error('IntentSpec has no successCriteria');
  for (const sc of spec.successCriteria) {
    if (!sc.id) throw new Error(`SuccessCriterion missing id`);
    if (!sc.description?.trim()) throw new Error(`SuccessCriterion ${sc.id} missing description`);
  }
}
