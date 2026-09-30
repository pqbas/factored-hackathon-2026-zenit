// The savings chart of "Mis productos" (spec/30-09-26-evolucion-ahorros). The
// bank keeps no past balances, only today's and the movements, so the series
// is rebuilt backwards from today's balance: only the last point is real.

export const SAVINGS_HISTORY_MONTHS = 12;

export type SavingsAccount = { currency: string; balance: number };

// Approved movements of the active savings accounts, inside the window.
export type SavingsMovement = {
  currency: string;
  date: string;
  type: string;
  amount: number;
};

export type SavingsSeries = {
  currency: string;
  current: number;
  points: Array<{ month: string; balance: number }>;
};

// Amounts come unsigned: a Deposit adds, Withdrawal, Payment and Transfer take.
const signedAmount = ({ type, amount }: SavingsMovement) =>
  type === 'Deposit' ? amount : -amount;

const round2 = (value: number) => Math.round(value * 100) / 100;

// 'YYYY-MM' (UTC) of the month `back` months before `now`.
const monthKey = (now: Date, back: number) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1))
    .toISOString()
    .slice(0, 7);

// First instant (UTC) of the window: the 1st of the month 11 months ago.
export function savingsWindowStart(now: Date) {
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth() - (SAVINGS_HISTORY_MONTHS - 1),
      1,
    ),
  );
}

export function buildSavingsHistory(
  accounts: SavingsAccount[],
  movements: SavingsMovement[],
  now: Date,
): SavingsSeries[] {
  const currencies = [...new Set(accounts.map((a) => a.currency))].sort();
  const months = Array.from({ length: SAVINGS_HISTORY_MONTHS }, (_, i) =>
    monthKey(now, SAVINGS_HISTORY_MONTHS - 1 - i),
  );

  const series: SavingsSeries[] = [];
  for (const currency of currencies) {
    const current = accounts
      .filter((a) => a.currency === currency)
      .reduce((sum, a) => sum + a.balance, 0);
    const newestFirst = movements
      .filter((m) => m.currency === currency)
      .sort((a, b) => b.date.localeCompare(a.date));

    // Walking back from today: the balance before a movement is the one
    // after it minus its effect. Every intermediate balance must be >= 0.
    let balance = current;
    let negative = current < 0;
    const endOfMonth = new Map<string, number>();
    let index = 0;
    for (let i = months.length - 1; i >= 0; i--) {
      // Balance at the end of months[i]: undo every movement after it.
      while (
        index < newestFirst.length &&
        newestFirst[index].date.slice(0, 7) > months[i]
      ) {
        balance -= signedAmount(newestFirst[index]);
        if (round2(balance) < 0) negative = true;
        index++;
      }
      endOfMonth.set(months[i], balance);
    }
    // The first month's movements: no point needs them, but the balance
    // before them (the start of the window) must not be negative either.
    for (; index < newestFirst.length; index++) {
      balance -= signedAmount(newestFirst[index]);
      if (round2(balance) < 0) negative = true;
    }
    if (negative) continue;

    series.push({
      currency,
      current: round2(current),
      points: months.map((month) => ({
        month,
        balance: round2(endOfMonth.get(month) ?? current),
      })),
    });
  }
  return series;
}
