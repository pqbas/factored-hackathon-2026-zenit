/**
 * Deletes the chats an evaluation report wrote (runs[].chatId), through the
 * back's own API as their owner. For runs against a deployed App, whose
 * conversations land in its database and its advisor console.
 *
 *   npm run eval:cleanup -- --report results/<report>.json --base <url> [--allow-prod]
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assertLocalBase } from './guard';

function parseArgs(argv: string[]) {
  let report = '';
  let base = '';
  let allowProd = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--report') report = argv[++i];
    else if (argv[i] === '--base') base = argv[++i];
    else if (argv[i] === '--allow-prod') allowProd = true;
    else throw new Error(`Unknown flag: ${argv[i]}`);
  }
  if (!report || !base)
    throw new Error('Pass --report <json> and --base <url>');
  assertLocalBase(base, allowProd);
  return { report, base };
}

async function main(argv: string[]) {
  const { report, base } = parseArgs(argv);
  const { runs } = JSON.parse(readFileSync(report, 'utf8')) as {
    runs: Array<{ chatId?: string }>;
  };
  const chatIds = [...new Set(runs.map((r) => r.chatId).filter(Boolean))];
  const local = ['localhost', '127.0.0.1'].includes(new URL(base).hostname);
  const token = local
    ? null
    : (
        JSON.parse(
          execFileSync(
            'databricks',
            [
              'auth',
              'token',
              '-p',
              process.env.DATABRICKS_CONFIG_PROFILE ?? 'DEFAULT',
              '-o',
              'json',
            ],
            { encoding: 'utf8' },
          ),
        ) as { access_token: string }
      ).access_token;
  let deleted = 0;
  for (const id of chatIds) {
    const response = await fetch(`${base}/api/chat/${id}`, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (response.ok) deleted++;
    else console.warn(`${id}: HTTP ${response.status}`);
  }
  console.log(`Deleted ${deleted}/${chatIds.length} chats`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
