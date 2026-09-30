import { assertLocalBase } from './guard';

// The runner's flags, apart from run.ts so the tests can load them (the
// Playwright loader can't import a module that uses import.meta).
const DEFAULT_BASE = 'http://localhost:3300';

// dev: the 40 cases of §7, which the agent gets tuned on. holdout: cases
// written apart and kept from the agent's team, to measure the "after"
// without leakage. Each set has its own freeze record.
export const SETS = {
  dev: { dir: 'cases', changes: 'case-changes.json' },
  holdout: { dir: 'cases-holdout', changes: 'case-changes-holdout.json' },
} as const;
export type EvalSet = keyof typeof SETS;

export type Args = {
  set: EvalSet;
  label: string | null;
  cases: string[] | null;
  runs: number;
  base: string;
  // Run against a deployed App (https://*.databricksapps.com).
  allowProd: boolean;
  classifier: string;
  out: string;
  delay: number;
};

export function parseArgs(argv: string[]): Args {
  const args: Args = {
    set: 'dev',
    label: null,
    cases: null,
    runs: 3,
    base: DEFAULT_BASE,
    allowProd: false,
    classifier: 'llm',
    out: '',
    delay: 0,
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = () => argv[++i];
    if (flag === '--case')
      args.cases = value()
        .split(',')
        .map((c) => c.trim().toUpperCase());
    else if (flag === '--runs') args.runs = Number(value());
    else if (flag === '--base') args.base = value();
    else if (flag === '--classifier') args.classifier = value();
    else if (flag === '--out') args.out = value();
    else if (flag === '--delay') args.delay = Number(value());
    else if (flag === '--set') args.set = value() as EvalSet;
    else if (flag === '--label') args.label = value();
    else if (flag === '--allow-prod') args.allowProd = true;
    else throw new Error(`Unknown flag: ${flag}`);
  }
  if (!(args.set in SETS)) throw new Error('--set must be dev or holdout');
  if (args.label !== null && !/^[a-z0-9-]+$/.test(args.label)) {
    throw new Error('--label must be lowercase letters, digits or dashes');
  }
  if (!Number.isInteger(args.runs) || args.runs < 1) {
    throw new Error('--runs must be a positive integer');
  }
  // Before anything else: nothing is sent to a base that isn't local.
  assertLocalBase(args.base, args.allowProd);
  return args;
}

// <date>[-holdout]-<classifier>[-<label>], e.g. 2026-09-29-holdout-llm-antes.
export function reportStem(
  args: Pick<Args, 'set' | 'classifier' | 'label'>,
  date = new Date().toISOString().slice(0, 10),
) {
  return [
    date,
    args.set === 'dev' ? null : args.set,
    args.classifier,
    args.label,
  ]
    .filter(Boolean)
    .join('-');
}
