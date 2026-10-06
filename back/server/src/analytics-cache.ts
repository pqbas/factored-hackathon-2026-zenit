/** Stale-while-revalidate: reads never wait on the warehouse. One loader per cache. */
export class AnalyticsCache<T> {
  private value: T | null = null;
  private updatedAt: number | null = null;
  private attemptedAt: number | null = null;
  private inFlight: Promise<void> | null = null;
  private failed = false;
  constructor(
    private readonly load: () => Promise<T>,
    private readonly now: () => number = Date.now,
    private readonly ttlMs = 600_000,
    private readonly maxAgeMs = 86_400_000,
    private readonly retryMs = 60_000,
  ) {}

  read(force = false) {
    const time = this.now();
    const expired =
      this.updatedAt === null || time - this.updatedAt >= this.ttlMs;
    if (
      (expired || force) &&
      !this.inFlight &&
      (this.attemptedAt === null || time - this.attemptedAt >= this.retryMs)
    ) {
      this.attemptedAt = time;
      this.inFlight = Promise.resolve()
        .then(this.load)
        .then((value) => {
          this.value = value;
          this.updatedAt = this.now();
          this.failed = false;
        })
        .catch(() => {
          this.failed = true;
        })
        .finally(() => {
          this.inFlight = null;
        });
    }
    const expiredHard =
      this.updatedAt !== null && time - this.updatedAt > this.maxAgeMs;
    return {
      data: expiredHard ? null : this.value,
      status:
        this.value !== null && !expiredHard
          ? expired
            ? 'stale'
            : 'fresh'
          : this.failed
            ? 'unavailable'
            : 'loading',
      updating: this.inFlight !== null,
      updatedAt:
        this.updatedAt !== null ? new Date(this.updatedAt).toISOString() : null,
      lastAttemptAt:
        this.attemptedAt !== null
          ? new Date(this.attemptedAt).toISOString()
          : null,
      lastRefreshFailed: this.failed,
      cacheSeconds: this.ttlMs / 1000,
    };
  }
  /** Test / CLI validation only. HTTP handlers use read() and return immediately. */
  async settled() {
    await this.inFlight;
  }
  get updating() {
    return this.inFlight !== null;
  }
}
