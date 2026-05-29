/**
 * gestalt projects — list and switch between projects (ADR-032).
 *
 *   gestalt projects list           — table of name / gitUrl / createdAt
 *   gestalt projects use <name>     — set currentProjectId in ~/.gestalt/config.json
 */

import { GestaltApiClient } from '../api/client';
import { loadCliConfig, updateCliConfig } from '../ui/config';
import { c, blank, divider, printTable } from '../ui/prompts';

export async function projectsListCommand(): Promise<void> {
  const config = await loadCliConfig();
  if (!config.token) {
    console.log(c.error('Not authenticated. Run: gestalt login'));
    process.exit(1);
  }

  const client = new GestaltApiClient({ serverUrl: config.serverUrl, token: config.token });

  try {
    const { data: projects } = await client.listProjects();

    blank();
    if (projects.length === 0) {
      console.log(c.dim('No projects yet. Run: gestalt init'));
      blank();
      return;
    }

    console.log(c.bold(`Projects (${projects.length})`));
    divider();
    printTable(
      projects.map((p) => ({
        current: p.id === config.currentProjectId ? c.success('*') : ' ',
        name:    p.name,
        gitUrl:  p.gitUrl,
        branch:  p.defaultBranch,
        created: new Date(p.createdAt).toLocaleDateString(),
      })),
      [
        { key: 'current', header: '',         width: 3 },
        { key: 'name',    header: 'Name',     width: 24 },
        { key: 'gitUrl',  header: 'Git URL',  width: 48 },
        { key: 'branch',  header: 'Branch',   width: 10 },
        { key: 'created', header: 'Created',  width: 12 },
      ],
    );
    blank();
    if (config.currentProjectId) {
      console.log(c.dim('* current project'));
      blank();
    }
  } catch (err) {
    console.log(c.error(`Failed to list projects: ${err instanceof Error ? err.message : String(err)}`));
    process.exit(1);
  }
}

export async function projectsUseCommand(name: string): Promise<void> {
  const config = await loadCliConfig();
  if (!config.token) {
    console.log(c.error('Not authenticated. Run: gestalt login'));
    process.exit(1);
  }

  const client = new GestaltApiClient({ serverUrl: config.serverUrl, token: config.token });

  try {
    const { data: projects } = await client.listProjects();
    const match = projects.find((p) => p.name === name);
    if (!match) {
      console.log(c.error(`No project named '${name}'. Run \`gestalt projects list\` to see what is registered.`));
      process.exit(1);
    }
    await updateCliConfig({ currentProjectId: match.id });
    blank();
    console.log(c.success(`✓ Current project set to ${match.name}`));
    console.log(c.dim(`  id:     ${match.id}`));
    console.log(c.dim(`  gitUrl: ${match.gitUrl}`));
    blank();
  } catch (err) {
    console.log(c.error(`Failed: ${err instanceof Error ? err.message : String(err)}`));
    process.exit(1);
  }
}
