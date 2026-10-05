import { execFileSync } from 'node:child_process';

// Kills Playwright browsers left behind by an interrupted run: processes from
// the ms-playwright cache whose parent died (re-parented to PID 1). Browsers of
// a run still in progress keep their worker as parent, so they are never
// touched. Returns how many it killed; never throws.
export function reapOrphanBrowsers(): number {
  if (process.platform === 'win32') return 0;
  let killed = 0;
  try {
    const ps = execFileSync('ps', ['-eo', 'pid=,ppid=,args='], {
      encoding: 'utf8',
    });
    for (const line of ps.split('\n')) {
      const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
      if (!match) continue;
      const [, pid, ppid, args] = match;
      if (ppid !== '1' || !args.includes('ms-playwright')) continue;
      try {
        process.kill(Number(pid), 'SIGKILL');
        killed++;
      } catch {
        // Already gone, or not ours.
      }
    }
  } catch {
    // No ps: nothing to reap.
  }
  return killed;
}
