/**
 * Fortify Static Code Analyzer scanner interpreter.
 * Parses Fortify FPR/XML output.
 * Severity mapping: CRITICAL/HIGH -> GOLDEN_PRINCIPLE_BREACH, MEDIUM -> CONSTRAINT_VIOLATION, LOW/INFO -> LINT_FAILURE
 * Full implementation: Phase 2.
 */
import type { ScannerInterpreter, ScannerResult } from '../../types';

export class FortifyInterpreter implements ScannerInterpreter {
  readonly name = 'fortify' as const;
  interpret(_rawResult: string): ScannerResult {
    throw new Error('fortify interpreter not yet implemented');
  }
}
