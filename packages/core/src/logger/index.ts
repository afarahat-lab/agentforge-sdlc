/**
 * @gestalt/core/logger
 *
 * Structured platform logger. Wraps pino for JSON logging in production
 * and pretty-printed output in development.
 *
 * All packages use this logger — never console.log.
 * Correlation IDs are automatically included when provided.
 */

import pino from 'pino';

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogContext {
  correlationId?: string;
  agentRole?: string;
  taskId?: string;
  intentId?: string;
  [key: string]: unknown;
}

const isDev = process.env['NODE_ENV'] !== 'production';

/**
 * The platform logger instance.
 * Use logger.child({ correlationId }) to create scoped child loggers.
 */
export const logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  ...(isDev
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname',
          },
        },
      }
    : {}),
  base: {
    service: 'gestalt',
    version: process.env['npm_package_version'] ?? '0.0.0',
  },
  serializers: {
    // Redact sensitive fields from logs (GP-006)
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
    err: pino.stdSerializers.err,
  },
  redact: {
    paths: [
      'password',
      'passwordHash',
      'apiKey',
      'api_key',
      'secret',
      'token',
      'authorization',
      'cookie',
      'email',           // redact in logs — use userId instead
      '*.email',
      '*.password',
    ],
    censor: '[REDACTED]',
  },
});

/**
 * Creates a child logger with bound context fields.
 * Use for agent workers to automatically include correlationId in all logs.
 *
 * @example
 * const log = createContextLogger({ correlationId: task.correlationId, agentRole: 'intent-agent' });
 * log.info('Starting intent parsing');
 */
export function createContextLogger(context: LogContext): pino.Logger {
  return logger.child(context);
}

/**
 * Logs a platform signal emission.
 * Used by all agents when they emit a signal.
 */
export function logSignal(
  log: pino.Logger,
  signal: { type: string; severity: string; message: string; location?: unknown },
): void {
  const level = signal.severity === 'critical' || signal.severity === 'high'
    ? 'warn'
    : 'info';
  log[level]({ signal }, `Signal emitted: ${signal.type}`);
}
