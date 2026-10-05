import { assertLocalBase } from '../eval/guard';

// Flags of simulate:day and simulate:cleanup, apart from the scripts so the
// tests can load them (no import.meta).
export const DEFAULT_BASE = 'http://localhost:3300';

export type DayArgs = {
  count: number;
  base: string;
  allowProd: boolean;
  day: string;
  concurrency: number;
  dryRun: boolean;
  force: boolean;
  label: string | null;
};

const isDay = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

export const todayUtc = () => new Date().toISOString().slice(0, 10);

export function parseDayArgs(argv: string[]): DayArgs {
  const args: DayArgs = {
    count: 100,
    base: DEFAULT_BASE,
    allowProd: false,
    day: todayUtc(),
    // One conversation at a time: each turn makes several LLM calls and the
    // workspace's Qwen QPS limit answers 429 with 3 in parallel (30-09-26).
    concurrency: 1,
    dryRun: false,
    force: false,
    label: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${flag} needs a value`);
      return v;
    };
    if (flag === '--count') args.count = Number(value());
    else if (flag === '--base') args.base = value();
    else if (flag === '--allow-prod') args.allowProd = true;
    else if (flag === '--day') args.day = value();
    else if (flag === '--concurrency') args.concurrency = Number(value());
    else if (flag === '--dry-run') args.dryRun = true;
    else if (flag === '--force') args.force = true;
    else if (flag === '--label') args.label = value();
    else throw new Error(`Unknown flag: ${flag}`);
  }
  if (!Number.isInteger(args.count) || args.count < 1) {
    throw new Error('--count must be a positive integer');
  }
  if (!Number.isInteger(args.concurrency) || args.concurrency < 1) {
    throw new Error('--concurrency must be a positive integer');
  }
  if (!isDay(args.day)) throw new Error('--day must be YYYY-MM-DD');
  if (args.label !== null && !/^[\w-]+$/.test(args.label)) {
    throw new Error('--label may only have letters, digits, _ and -');
  }
  assertLocalBase(args.base, args.allowProd);
  return args;
}

export type CleanupArgs = {
  day: string | null;
  file: string | null;
  base: string;
  allowProd: boolean;
};

export function parseCleanupArgs(argv: string[]): CleanupArgs {
  const args: CleanupArgs = {
    day: null,
    file: null,
    base: DEFAULT_BASE,
    allowProd: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${flag} needs a value`);
      return v;
    };
    if (flag === '--day') args.day = value();
    else if (flag === '--file') args.file = value();
    else if (flag === '--base') args.base = value();
    else if (flag === '--allow-prod') args.allowProd = true;
    else throw new Error(`Unknown flag: ${flag}`);
  }
  if (!args.day && !args.file)
    throw new Error('Pass --day <date> or --file <json>');
  if (args.day && !isDay(args.day)) throw new Error('--day must be YYYY-MM-DD');
  assertLocalBase(args.base, args.allowProd);
  return args;
}

// runs/<day>.json, or runs/<day>-<label>.json.
export function runFileName(day: string, label: string | null): string {
  return label ? `${day}-${label}.json` : `${day}.json`;
}

// End of the day in UTC: when the day's sessions expire.
export function endOfDayUtc(day: string): Date {
  return new Date(`${day}T23:59:59.999Z`);
}

export type BackfillArgs = {
  from: string;
  to: string;
  seed: string;
  dryRun: boolean;
  allowProd: boolean;
  cleanup: boolean;
  file: string | null;
};

// Writing to Lakebase needs --allow-prod; without it only a local SIM_PG_URL.
export function assertLocalDatabase(
  pgUrl: string | undefined,
  allowProd: boolean,
): void {
  if (allowProd) return;
  const host = pgUrl ? new URL(pgUrl).hostname : null;
  if (host === 'localhost' || host === '127.0.0.1') return;
  throw new Error(
    'Refusing to write to Lakebase without --allow-prod (or point SIM_PG_URL at a local Postgres)',
  );
}

export function parseBackfillArgs(argv: string[]): BackfillArgs {
  const args: BackfillArgs = {
    from: '2026-10-01',
    to: '2026-10-04',
    seed: 'backfill',
    dryRun: false,
    allowProd: false,
    cleanup: false,
    file: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${flag} needs a value`);
      return v;
    };
    if (flag === '--from') args.from = value();
    else if (flag === '--to') args.to = value();
    else if (flag === '--seed') args.seed = value();
    else if (flag === '--dry-run') args.dryRun = true;
    else if (flag === '--allow-prod') args.allowProd = true;
    else if (flag === '--cleanup') args.cleanup = true;
    else if (flag === '--file') args.file = value();
    else throw new Error(`Unknown flag: ${flag}`);
  }
  if (!isDay(args.from) || !isDay(args.to)) {
    throw new Error('--from and --to must be YYYY-MM-DD');
  }
  if (args.from > args.to) throw new Error('--from is after --to');
  if (args.cleanup && !args.file) throw new Error('--cleanup needs --file');
  return args;
}

// runs/backfill-<from>_<to>.json
export function backfillFileName(from: string, to: string): string {
  return `backfill-${from}_${to}.json`;
}
