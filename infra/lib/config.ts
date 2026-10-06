import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

// The same values back/scripts/aws/setup.sh and agent/scripts/aws/setup.sh
// give the services today, under new names so both deployments coexist.

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const ACCOUNT = '335741630127';
export const REGION = 'us-west-2';

export const NAMES = {
  back: 'zenit-back',
  agent: 'zenit-agent',
  accessRole: 'zenit-apprunner-ecr-access',
  backInstanceRole: 'zenit-back-instance',
  agentInstanceRole: 'zenit-agent-instance',
};

// The images are the ones the bash deploys already push.
export const ECR_REPOS = {
  back: 'bank-assistant-back',
  agent: 'bank-assistant-agent',
};

// Complete ARNs (App Runner wants the suffix). They identify the secrets, they
// don't hold them; the values stay in Secrets Manager.
const secret = (nameWithSuffix: string) =>
  `arn:aws:secretsmanager:${REGION}:${ACCOUNT}:secret:${nameWithSuffix}`;

export const SECRETS = {
  backSp: secret('bank-assistant/databricks-sp-ZWeFJQ'),
  sessionSecret: secret('bank-assistant/back/session-secret-8h9UPV'),
  demoUsers: secret('bank-assistant/back/demo-users-C7E3g7'),
  demoLogins: secret('bank-assistant/back/demo-logins-RzcYcV'),
  agentToken: secret('bank-assistant/agent/invoke-token-4dU7bK'),
  agentSp: secret('bank-assistant/agent/databricks-sp-WXpSqx'),
  jevApiKey: secret('bank-assistant/agent/jev-api-key-PVw714'),
};

export const BACK_ENV = {
  AUTH_MODE: 'password',
  AGENT_QUEUE_WORKER: 'on',
  PGHOST: 'ep-twilight-pond-d1ie80dl.database.us-west-2.cloud.databricks.com',
  PGDATABASE: 'databricks_postgres',
  PGPORT: '5432',
  PGSSLMODE: 'require',
  ADMIN_EMAILS: 'admin@demo.bank-assistant.example',
  ADVISOR_EMAILS: 'asesor@demo.bank-assistant.example',
};

export const AGENT_ENV = {
  CLASSIFIER: 'jev',
  AGENT_TRACING: 'off',
  LLM_ENDPOINT: 'databricks-qwen3-next-80b-a3b-instruct',
  LAKEBASE_INSTANCE: 'bank-assistant-chat-db',
  LAKEBASE_DATABASE: 'databricks_postgres',
};

// One variable of a Databricks App's app.yaml (`env: [{name, value}]`), the
// source the bash setups already point at for the demo customers.
export function readAppYamlEnv(path: string, name: string): string {
  const doc = parse(readFileSync(path, 'utf8')) as {
    env?: Array<{ name: string; value?: string }>;
  };
  const value = doc.env?.find((e) => e.name === name)?.value;
  if (value === undefined) throw new Error(`${name} is not in ${path}`);
  return value;
}
