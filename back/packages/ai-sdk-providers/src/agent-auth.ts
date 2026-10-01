// How the back authenticates against the agent behind API_PROXY.
//
// - A Databricks App (or a serving endpoint): the workspace OAuth token, as
//   Authorization: Bearer.
// - The agent on AWS (spec/01-10-26-agent-token): a shared secret in the
//   x-agent-token header. The Databricks token means nothing there, so it is
//   not sent.
export const AGENT_TOKEN_HEADER = 'x-agent-token';

// The shared secret applies only with API_PROXY: without it the request goes
// to Databricks, which must never receive that secret.
export function usesAgentToken(
  env: Record<string, string | undefined> = process.env,
) {
  return Boolean(env.API_PROXY && env.AGENT_TOKEN);
}

export async function setAgentAuth(
  headers: Headers,
  getDatabricksToken: () => Promise<string>,
  env: Record<string, string | undefined> = process.env,
) {
  if (usesAgentToken(env)) {
    headers.delete('Authorization');
    headers.set(AGENT_TOKEN_HEADER, env.AGENT_TOKEN as string);
    return;
  }
  headers.set('Authorization', `Bearer ${await getDatabricksToken()}`);
}
