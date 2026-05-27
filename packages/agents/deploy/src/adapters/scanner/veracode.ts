/**
 * Veracode scanner interpreter.
 * Parses Veracode results API XML output.
 * Severity mapping: CRITICAL/HIGH -> GOLDEN_PRINCIPLE_BREACH, MEDIUM -> CONSTRAINT_VIOLATION, LOW/INFO -> LINT_FAILURE
 * Full implementation: Phase 2.
 */
import type { ScannerInterpreter, ScannerResult } from '../../types';

export class VeracodeInterpreter implements ScannerInterpreter {
  readonly name = 'veracode' as const;
  interpret(_rawResult: string): ScannerResult {
    throw new Error('veracode interpreter not yet implemented');
  }
}
