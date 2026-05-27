/**
 * SonarQube scanner interpreter.
 * Parses SonarQube Web API quality gate results.
 * Severity mapping: CRITICAL/HIGH -> GOLDEN_PRINCIPLE_BREACH, MEDIUM -> CONSTRAINT_VIOLATION, LOW/INFO -> LINT_FAILURE
 * Full implementation: Phase 2.
 */
import type { ScannerInterpreter, ScannerResult } from '../../types';

export class SonarqubeInterpreter implements ScannerInterpreter {
  readonly name = 'sonarqube' as const;
  interpret(_rawResult: string): ScannerResult {
    throw new Error('sonarqube interpreter not yet implemented');
  }
}
