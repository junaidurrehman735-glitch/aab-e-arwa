export type DashboardPeriod = 'today' | 'yesterday' | 'last7days' | 'last30days' | 'all_time';

export interface DateRange {
  startMs: number;
  endMs: number;
  label: string;
  period: DashboardPeriod;
}

export const PAKISTAN_TIMEZONE = 'Asia/Karachi';

/**
 * Computes exact millisecond boundaries for a given DashboardPeriod in Pakistan local calendar time (Asia/Karachi, UTC+5).
 * - Today: 00:00:00 today -> 23:59:59.999 today PK
 * - Yesterday: 00:00:00 yesterday -> 23:59:59.999 yesterday PK
 * - Last 7 Days: Today + previous 6 calendar days (7 calendar days total)
 * - Last 30 Days: Today + previous 29 calendar days (30 calendar days total)
 * - All Time: No date restriction (0 to MAX_SAFE_INTEGER)
 */
export function getPakistanDateRange(period: DashboardPeriod = 'today'): DateRange {
  const now = new Date();
  const pkDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: PAKISTAN_TIMEZONE }).format(now);
  const [curY, curM, curD] = pkDateStr.split('-').map(Number);

  // UTC+5 conversion:
  // PK 00:00:00 corresponds to UTC hour (0 - 5) = -5 = 19:00 previous UTC day
  // PK 23:59:59.999 corresponds to UTC hour (23 - 5) = 18 = 18:59:59.999 UTC
  const getPkDayStartMs = (year: number, monthIndex: number, day: number) => {
    return Date.UTC(year, monthIndex, day, -5, 0, 0, 0);
  };
  const getPkDayEndMs = (year: number, monthIndex: number, day: number) => {
    return Date.UTC(year, monthIndex, day, 18, 59, 59, 999);
  };

  if (period === 'all_time') {
    return {
      startMs: 0,
      endMs: Number.MAX_SAFE_INTEGER,
      label: 'All Time',
      period: 'all_time',
    };
  }

  if (period === 'yesterday') {
    const yestDate = new Date(Date.UTC(curY, curM - 1, curD - 1, 12, 0, 0));
    const yestStr = new Intl.DateTimeFormat('en-CA', { timeZone: PAKISTAN_TIMEZONE }).format(yestDate);
    const [yY, yM, yD] = yestStr.split('-').map(Number);
    return {
      startMs: getPkDayStartMs(yY, yM - 1, yD),
      endMs: getPkDayEndMs(yY, yM - 1, yD),
      label: 'Yesterday',
      period: 'yesterday',
    };
  }

  if (period === 'last7days') {
    // Today + previous 6 calendar days = 7 days total
    const pastDate = new Date(Date.UTC(curY, curM - 1, curD - 6, 12, 0, 0));
    const pastStr = new Intl.DateTimeFormat('en-CA', { timeZone: PAKISTAN_TIMEZONE }).format(pastDate);
    const [pY, pM, pD] = pastStr.split('-').map(Number);
    return {
      startMs: getPkDayStartMs(pY, pM - 1, pD),
      endMs: getPkDayEndMs(curY, curM - 1, curD),
      label: 'Last 7 Days',
      period: 'last7days',
    };
  }

  if (period === 'last30days') {
    // Today + previous 29 calendar days = 30 days total
    const pastDate = new Date(Date.UTC(curY, curM - 1, curD - 29, 12, 0, 0));
    const pastStr = new Intl.DateTimeFormat('en-CA', { timeZone: PAKISTAN_TIMEZONE }).format(pastDate);
    const [pY, pM, pD] = pastStr.split('-').map(Number);
    return {
      startMs: getPkDayStartMs(pY, pM - 1, pD),
      endMs: getPkDayEndMs(curY, curM - 1, curD),
      label: 'Last 30 Days',
      period: 'last30days',
    };
  }

  // Default 'today'
  return {
    startMs: getPkDayStartMs(curY, curM - 1, curD),
    endMs: getPkDayEndMs(curY, curM - 1, curD),
    label: 'Today',
    period: 'today',
  };
}

/**
 * Checks whether a given timestamp string, number, or Date falls within a DateRange.
 */
export function isTimestampInRange(
  timestamp: string | number | Date | null | undefined,
  range: DateRange
): boolean {
  if (!timestamp) return false;
  if (range.period === 'all_time') return true;
  try {
    const t = typeof timestamp === 'number' ? timestamp : new Date(timestamp).getTime();
    if (isNaN(t)) return false;
    return t >= range.startMs && t <= range.endMs;
  } catch (_) {
    return false;
  }
}

/**
 * Safe percentage calculation:
 * - (count / total) * 100
 * - Clamped between 0 and 100
 * - Returns 0 when total is 0 or count <= 0
 * - Never NaN, never Infinity, never negative
 */
export function safePercentage(count: number, total: number, decimals: number = 1): number {
  if (!total || total <= 0 || !count || count <= 0) return 0;
  const raw = (count / total) * 100;
  if (isNaN(raw) || !isFinite(raw) || raw < 0) return 0;
  const clamped = Math.min(100, Math.max(0, raw));
  const factor = Math.pow(10, decimals);
  return Math.round(clamped * factor) / factor;
}
