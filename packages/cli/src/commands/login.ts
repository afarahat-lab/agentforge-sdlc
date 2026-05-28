/**
 * gestalt login — authenticates against the Gestalt server.
 * Stores the JWT token in ~/.gestalt/config.json.
 */

import { GestaltApiClient } from '../api/client';
import { loadCliConfig, updateCliConfig } from '../ui/config';
import {
  c, blank, divider, createSpinner,
  prompt, promptSecret, printLocalAuthWarning,
} from '../ui/prompts';

export async function loginCommand(serverUrl?: string): Promise<void> {
  const config = await loadCliConfig();
  const url = serverUrl ?? config.serverUrl;

  blank();
  console.log(c.bold('Sign in to Gestalt'));
  console.log(c.dim(`Server: ${url}`));
  divider();

  // Check server health first
  const healthSpinner = createSpinner('Connecting to server...');
  healthSpinner.start();

  const client = new GestaltApiClient({ serverUrl: url });

  try {
    await client.health();
    healthSpinner.succeed(c.success('Server reachable'));
  } catch (err) {
    healthSpinner.fail(c.error(`Cannot reach server at ${url}`));
    console.log(c.dim('Check that the Gestalt server is running: docker-compose ps'));
    process.exit(1);
  }

  blank();

  // Collect credentials
  const email = await prompt('Email');
  const password = await promptSecret('Password');

  blank();
  const loginSpinner = createSpinner('Signing in...');
  loginSpinner.start();

  try {
    const { token } = await client.login(email, password);
    client.setToken(token);

    const user = await client.getMe();
    loginSpinner.succeed(c.success(`Signed in as ${user.email} (${user.role})`));

    await updateCliConfig({ serverUrl: url, token });

    // Show warning if local auth is in use
    if ((user as { authProvider?: string }).authProvider === 'local') {
      printLocalAuthWarning();
    }

    blank();
    console.log(c.dim('Run `gestalt init` to set up your first project.'));
    blank();

  } catch (err) {
    loginSpinner.fail(c.error(`Sign in failed: ${err instanceof Error ? err.message : String(err)}`));
    process.exit(1);
  }
}
