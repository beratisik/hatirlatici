import AsyncStorage from '@react-native-async-storage/async-storage';

import { padDatePart } from '@/context/GoalContext';
import { addDays, formatDisplayDate, startOfDay, startOfToday } from '@/lib/schedule';

export const CYCLE_STORAGE_KEY = '@hatirlatici/cycle';
export const DEFAULT_CYCLE_LENGTH = 28;
export const DEFAULT_PERIOD_LENGTH = 5;
export const CYCLE_LENGTH_RANGE = { min: 21, max: 45 };
export const PERIOD_LENGTH_RANGE = { min: 2, max: 10 };

export type CycleSettings = {
  lastPeriodDate: string;
  cycleLength: number;
  periodLength: number;
};

export type CyclePhase = 'period' | 'follicular' | 'fertile' | 'ovulation' | 'luteal' | 'late';

export type CycleSnapshot = {
  lastPeriod: Date;
  nextExpected: Date;
  daysUntilNext: number;
  cycleDay: number;
  phase: CyclePhase;
  phaseLabel: string;
  headlineValue: string;
  headlineLabel: string;
  accent: 'green' | 'red';
};

function daysBetween(start: Date, end: Date): number {
  return Math.round((startOfDay(end).getTime() - startOfDay(start).getTime()) / 86400000);
}

export function parseIsoDay(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  parsed.setHours(0, 0, 0, 0);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function toIsoDay(day: Date): string {
  return `${day.getFullYear()}-${padDatePart(day.getMonth() + 1)}-${padDatePart(day.getDate())}`;
}

export function isCycleSettings(value: unknown): value is CycleSettings {
  if (!value || typeof value !== 'object') return false;
  const raw = value as Partial<CycleSettings>;
  const last = typeof raw.lastPeriodDate === 'string' ? parseIsoDay(raw.lastPeriodDate) : null;
  const cycle = Number(raw.cycleLength);
  const period = Number(raw.periodLength);
  return (
    !!last &&
    Number.isInteger(cycle) &&
    cycle >= CYCLE_LENGTH_RANGE.min &&
    cycle <= CYCLE_LENGTH_RANGE.max &&
    Number.isInteger(period) &&
    period >= PERIOD_LENGTH_RANGE.min &&
    period <= PERIOD_LENGTH_RANGE.max
  );
}

export async function loadCycleSettings(): Promise<CycleSettings | null> {
  try {
    const raw = await AsyncStorage.getItem(CYCLE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isCycleSettings(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveCycleSettings(settings: CycleSettings): Promise<void> {
  await AsyncStorage.setItem(CYCLE_STORAGE_KEY, JSON.stringify(settings));
}

function ovulationDay(cycleLength: number, periodLength: number): number {
  const typical = cycleLength - 14;
  return Math.max(periodLength + 2, Math.min(cycleLength - 3, typical));
}

function describePhase(phase: CyclePhase): string {
  switch (phase) {
    case 'period':
      return 'Adet döneminde';
    case 'follicular':
      return 'Foliküler evre';
    case 'fertile':
      return 'Yumurtlama dönemine yakın';
    case 'ovulation':
      return 'Yumurtlama penceresi';
    case 'luteal':
      return 'Luteal evre';
    case 'late':
      return 'Beklenen tarih geçti';
  }
}

export function analyzeCycle(settings: CycleSettings, today = startOfToday()): CycleSnapshot | null {
  const lastPeriod = parseIsoDay(settings.lastPeriodDate);
  if (!lastPeriod) return null;

  const nextExpected = addDays(lastPeriod, settings.cycleLength);
  const daysUntilNext = daysBetween(today, nextExpected);
  const cycleDay = daysBetween(lastPeriod, today) + 1;
  const ovulation = ovulationDay(settings.cycleLength, settings.periodLength);

  let phase: CyclePhase;
  if (daysUntilNext < 0) {
    phase = 'late';
  } else if (cycleDay <= settings.periodLength) {
    phase = 'period';
  } else if (cycleDay >= ovulation && cycleDay <= ovulation + 1) {
    phase = 'ovulation';
  } else if (cycleDay >= ovulation - 2 && cycleDay < ovulation) {
    phase = 'fertile';
  } else if (cycleDay < ovulation) {
    phase = 'follicular';
  } else {
    phase = 'luteal';
  }

  const late = daysUntilNext < 0;
  const headlineValue = late
    ? String(Math.abs(daysUntilNext))
    : daysUntilNext === 0
      ? '0'
      : String(daysUntilNext);
  const headlineLabel = late
    ? daysUntilNext === -1
      ? 'gün gecikti'
      : 'gün gecikti'
    : daysUntilNext === 0
      ? 'bugün beklenen gün'
      : daysUntilNext === 1
        ? 'gün kaldı'
        : 'gün kaldı';

  return {
    lastPeriod,
    nextExpected,
    daysUntilNext,
    cycleDay: Math.max(1, cycleDay),
    phase,
    phaseLabel: describePhase(phase),
    headlineValue,
    headlineLabel,
    accent: late || daysUntilNext === 0 ? 'red' : 'green',
  };
}

export function formatCycleDate(day: Date): string {
  return formatDisplayDate(day);
}
