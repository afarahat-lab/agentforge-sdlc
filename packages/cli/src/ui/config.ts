/**
 * CLI configuration — persists server URL and auth token
 * in ~/.gestalt/config.json between sessions.
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import type { CliConfig } from '../types';
import { DEFAULT_CLI_CONFIG } from '../types';

const CONFIG_DIR = join(homedir(), '.gestalt');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

export async function loadCliConfig(): Promise<CliConfig> {
  try {
    const raw = await readFile(CONFIG_PATH, 'utf8');
    return { ...DEFAULT_CLI_CONFIG, ...JSON.parse(raw) } as CliConfig;
  } catch {
    return { ...DEFAULT_CLI_CONFIG };
  }
}

export async function saveCliConfig(config: CliConfig): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
}

export async function updateCliConfig(patch: Partial<CliConfig>): Promise<CliConfig> {
  const current = await loadCliConfig();
  const updated = { ...current, ...patch };
  await saveCliConfig(updated);
  return updated;
}
