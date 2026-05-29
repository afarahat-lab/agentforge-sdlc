/**
 * Shared helpers for the four maintenance agents.
 */

/**
 * Embed a Git PAT into an HTTPS clone URL. Mirrors the helper used by
 * the generate, gate, and deploy orchestrators.
 */
export function authenticatedGitUrl(gitUrl: string, token: string): string {
  if (!gitUrl.startsWith('http://') && !gitUrl.startsWith('https://')) {
    return gitUrl;
  }
  const url = new URL(gitUrl);
  url.username = 'x-access-token';
  url.password = token;
  return url.toString();
}

/**
 * Standard prefix prepended to every maintenance-dispatched intent text
 * so duplicate detection can identify the type and pick out only the
 * intents the agent should consider for de-duping.
 */
export function maintenanceIntentPrefix(type: string): string {
  return `[gestalt-maintenance/${type}]`;
}

/**
 * Wraps the agent's user-facing `suggestedAction` with the maintenance
 * prefix so the intent table stays distinguishable from human-submitted
 * intents.
 */
export function maintenanceIntentText(type: string, suggestedAction: string): string {
  return `${maintenanceIntentPrefix(type)} ${suggestedAction}`;
}
