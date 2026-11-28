import { TokenType } from '../types/actake';
import { TOKEN_CONFIGS } from '../solana/actakeEscrow';

export type StakeVisibility = 'solo' | 'community';
export type RecurrenceCadence = 'once' | 'daily' | 'weekdays';

export interface RecurringDayPreset {
  days: number;
  shortLabel: string;
  subLabel: string;
  cadence: RecurrenceCadence;
}

export const RECURRING_DAY_PRESETS: RecurringDayPreset[] = [
  { days: 1, shortLabel: 'Once', subLabel: '1 day', cadence: 'once' },
  { days: 3, shortLabel: '3 Days', subLabel: 'Sprint', cadence: 'daily' },
  { days: 7, shortLabel: '7 Days', subLabel: '1 Week', cadence: 'daily' },
  { days: 8, shortLabel: '8 Days', subLabel: 'Streak', cadence: 'daily' },
  { days: 14, shortLabel: '14 Days', subLabel: '2 Weeks', cadence: 'daily' },
  { days: 30, shortLabel: '30 Days', subLabel: '1 Month', cadence: 'daily' },
];

export interface DailyPayoutBreakdown {
  totalStake: number;
  totalDays: number;
  baseDailyPrincipal: number;
  finalDayPrincipal: number;
  principalForDay: number;
  estDailyBonus: number;
  protocolFeePct: number;
  dailyProtocolFee: number;
  estNetDailyPayout: number;
  estFullCycleBonus: number;
  estFullCyclePayout: number;
  hasFinalDayRemainder: boolean;
}

export function clampRecurringDays(days: number): number {
  if (!Number.isFinite(days)) return 1;
  return Math.max(1, Math.min(365, Math.round(days)));
}

export function formatScheduleLabel(totalDays: number, cadence?: RecurrenceCadence): string {
  const safeDays = clampRecurringDays(totalDays);
  if (safeDays === 1 || cadence === 'once') {
    return 'Once (1 day)';
  }
  const suffix = cadence === 'weekdays' ? ' · Weekdays' : '';
  if (safeDays === 7) return `7 Days (1 Week)${suffix}`;
  if (safeDays === 14) return `14 Days (2 Weeks)${suffix}`;
  if (safeDays === 30) return `30 Days (1 Month)${suffix}`;
  return `${safeDays} Days${suffix}`;
}

export function calculateDailyPayoutBreakdown(params: {
  totalStake: number;
  totalDays: number;
  token: TokenType;
  visibility?: StakeVisibility;
  dayIndex?: number;
}): DailyPayoutBreakdown {
  const safeStake =
    Number.isFinite(params.totalStake) && params.totalStake > 0
      ? Number(params.totalStake.toFixed(2))
      : 0;
  const safeDays = clampRecurringDays(params.totalDays);
  const baseDailyPrincipal = Math.floor((safeStake / safeDays) * 100) / 100;
  const finalDayPrincipal = Number((safeStake - baseDailyPrincipal * (safeDays - 1)).toFixed(2));
  const isFinalDay = typeof params.dayIndex === 'number' && params.dayIndex >= safeDays;
  const principalForDay = isFinalDay ? finalDayPrincipal : baseDailyPrincipal;

  const bonusRate =
    params.token === 'SKR'
      ? params.visibility === 'community'
        ? 0.24
        : 0.2
      : params.visibility === 'community'
        ? 0.18
        : 0.15;

  const estFullCycleBonus = Number((safeStake * bonusRate).toFixed(2));
  const estDailyBonus = Number((estFullCycleBonus / safeDays).toFixed(2));
  const protocolFeePct = TOKEN_CONFIGS[params.token].protocolFeePct;
  const dailyGross = principalForDay + estDailyBonus;
  const dailyProtocolFee = Number(((dailyGross * protocolFeePct) / 100).toFixed(4));
  const estNetDailyPayout = Number(Math.max(0, dailyGross - dailyProtocolFee).toFixed(2));
  const fullGross = safeStake + estFullCycleBonus;
  const fullFee = Number(((fullGross * protocolFeePct) / 100).toFixed(2));
  const estFullCyclePayout = Number(Math.max(0, fullGross - fullFee).toFixed(2));

  return {
    totalStake: safeStake,
    totalDays: safeDays,
    baseDailyPrincipal,
    finalDayPrincipal,
    principalForDay,
    estDailyBonus,
    protocolFeePct,
    dailyProtocolFee,
    estNetDailyPayout,
    estFullCycleBonus,
    estFullCyclePayout,
    hasFinalDayRemainder: Math.abs(finalDayPrincipal - baseDailyPrincipal) >= 0.009,
  };
}
