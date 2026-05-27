/**
 * Checkmarx SAST scanner interpreter.
 * Parses Checkmarx XML/JSON output.
 * Severity mapping: CRITICAL/HIGH -> GOLDEN_PRINCIPLE_BREACH, MEDIUM -> CONSTRAINT_VIOLATION, LOW/INFO -> LINT_FAILURE
 * Full implementation: Phase 2.
 */
import type { ScannerInterpreter, ScannerResult } from '../../types';

export class CheckmarxInterpreter implements ScannerInterpreter {
  readonly name = 'checkmarx' as const;
  interpret(_rawResult: string): ScannerResult {
    throw new Error('checkmarx interpreter not yet implemented');
  }
}
