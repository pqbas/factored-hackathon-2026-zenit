/**
 * The final comparison: the dev set (the 40 cases of §7, which the agent was
 * tuned on) before and after, next to the held-out set, which the agent's
 * team never saw. Reads reports written by `npm run eval`.
 *
 *   npm run eval:compare -- --dev-before <report.json> --dev-after <…>
 *     --holdout-before <…> --holdout-after <…> [--out comparacion.md]
 *
 * Every report is optional: a missing one shows as "—".
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type Comparison, compareToMarkdown } from './compare-report';

function parseArgs(argv: string[]) {
  const flags: Record<string, keyof Comparison> = {
    '--dev-before': 'devBefore',
    '--dev-after': 'devAfter',
    '--holdout-before': 'holdoutBefore',
    '--holdout-after': 'holdoutAfter',
  };
  const paths: Partial<Record<keyof Comparison, string>> = {};
  let out: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--out') out = argv[++i];
    else if (flag in flags) paths[flags[flag]] = argv[++i];
    else throw new Error(`Unknown flag: ${flag}`);
  }
  return { paths, out };
}

function main(argv: string[]) {
  const { paths, out } = parseArgs(argv);
  const reports: Comparison = {};
  for (const [key, path] of Object.entries(paths)) {
    reports[key as keyof Comparison] = JSON.parse(readFileSync(path, 'utf8'));
  }
  const markdown = compareToMarkdown(reports);
  if (out) writeFileSync(out, markdown);
  console.log(markdown);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
