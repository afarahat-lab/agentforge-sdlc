/**
 * Maintenance scheduler — manages cron-based execution of scheduled agents.
 *
 * Drift and alignment agents run daily.
 * GC agent runs weekly.
 * Evaluation agent runs on-demand (triggered by monitoring, not cron).
 *
 * Uses node-cron for schedule management.
 * Each scheduled run creates a BullMQ task — agents are still ephemeral workers.
 */

import type { MaintenanceHarnessConfig } from '../types';

export interface ScheduledJob {
  agentRole: string;
  schedule: string;      // cron expression
  enabled: boolean;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
}

export interface Scheduler {
  start(): void;
  stop(): void;
  getJobs(): ScheduledJob[];
  runNow(agentRole: string): Promise<void>;
}

/**
 * Creates the maintenance scheduler from harness config.
 * Phase 2: full node-cron implementation.
 */
export function createMaintenanceScheduler(
  config: MaintenanceHarnessConfig,
  enqueueAgent: (agentRole: string) => Promise<void>,
): Scheduler {
  const jobs: ScheduledJob[] = [
    {
      agentRole: 'drift-agent',
      schedule: config.driftCheck.scheduleUtc,
      enabled: config.driftCheck.enabled,
      lastRunAt: null,
      nextRunAt: null,
    },
    {
      agentRole: 'alignment-agent',
      schedule: config.alignmentCheck.scheduleUtc,
      enabled: config.alignmentCheck.enabled,
      lastRunAt: null,
      nextRunAt: null,
    },
    {
      agentRole: 'gc-agent',
      schedule: config.gcCheck.scheduleUtc,
      enabled: config.gcCheck.enabled,
      lastRunAt: null,
      nextRunAt: null,
    },
  ];

  return {
    start() {
      // Phase 2: register cron jobs via node-cron
      // for (const job of jobs.filter(j => j.enabled)) {
      //   cron.schedule(job.schedule, () => enqueueAgent(job.agentRole), { timezone: 'UTC' });
      // }
    },
    stop() {
      // Phase 2: destroy all cron tasks
    },
    getJobs() {
      return jobs;
    },
    async runNow(agentRole: string) {
      await enqueueAgent(agentRole);
    },
  };
}
