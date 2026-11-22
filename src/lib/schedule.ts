import {
  padDatePart,
  parseGoalDate,
  parseGoalTime,
  startOfToday,
  todayIso,
  weekdayOf,
  type Goal,
} from '@/context/GoalContext';

export { startOfToday };

export function formatDisplayDate(day: Date): string {
  return `${padDatePart(day.getDate())}.${padDatePart(day.getMonth() + 1)}.${day.getFullYear()}`;
}

export function startOfDay(value: Date): Date {
  const day = new Date(value);
  day.setHours(0, 0, 0, 0);
  return day;
}

export function startOfWeekMonday(value: Date): Date {
  const day = startOfDay(value);
  const offset = (day.getDay() + 6) % 7;
  day.setDate(day.getDate() - offset);
  return day;
}

export function addDays(value: Date, amount: number): Date {
  const next = startOfDay(value);
  next.setDate(next.getDate() + amount);
  return next;
}

export function startOfMonth(value: Date): Date {
  const day = startOfDay(value);
  day.setDate(1);
  return day;
}

export function addMonths(value: Date, amount: number): Date {
  const current = startOfDay(value);
  const dayOfMonth = current.getDate();
  const next = startOfMonth(current);
  next.setMonth(next.getMonth() + amount);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(dayOfMonth, lastDay));
  return next;
}

export function monthGridDays(monthDate: Date): (Date | null)[] {
  const first = startOfMonth(monthDate);
  const leading = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array(leading).fill(null),
    ...Array.from({ length: daysInMonth }, (_, index) => addDays(first, index)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function weekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}

function parseIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  parsed.setHours(0, 0, 0, 0);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function goalOrigin(goal: Goal): Date {
  return parseGoalDate(goal.date) ?? parseIsoDate(goal.startedAt ?? '') ?? startOfToday();
}

function daysBetween(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

export function goalOccursOn(goal: Goal, day: Date): boolean {
  if (goal.archived) return false;

  const target = startOfDay(day);
  const end = parseGoalDate(goal.endDate);
  if (end && target.getTime() > end.getTime()) return false;

  const origin = goalOrigin(goal);

  if (goal.daysOfWeek && goal.daysOfWeek.length > 0) {
    if (target.getTime() < origin.getTime()) return false;
    return goal.daysOfWeek.includes(weekdayOf(target));
  }

  if (!goal.repeat) {
    return isSameDay(origin, target);
  }

  if (target.getTime() < origin.getTime()) return false;

  const interval = Math.max(1, goal.repeat.interval);

  switch (goal.repeat.unit) {
    case 'saat':
    case 'gun':
      return daysBetween(origin, target) % interval === 0;
    case 'hafta':
      return daysBetween(origin, target) % (interval * 7) === 0;
    case 'ay': {
      if (target.getDate() !== origin.getDate()) return false;
      const months =
        (target.getFullYear() - origin.getFullYear()) * 12 + (target.getMonth() - origin.getMonth());
      return months >= 0 && months % interval === 0;
    }
    default:
      return false;
  }
}

export function goalsOnDay(goals: Goal[], day: Date): Goal[] {
  return goals.filter((goal) => goalOccursOn(goal, day));
}

function toIsoDay(day: Date): string {
  return `${day.getFullYear()}-${padDatePart(day.getMonth() + 1)}-${padDatePart(day.getDate())}`;
}

function applyClock(day: Date, time: string): Date {
  const clock = parseGoalTime(time);
  const next = new Date(day);
  if (clock) next.setHours(clock.hour, clock.minute, 0, 0);
  else next.setHours(0, 0, 0, 0);
  return next;
}

export function lastOccurrenceOnOrBefore(goal: Goal, day: Date): Date | null {
  const origin = goalOrigin(goal);
  const end = startOfDay(day);
  if (end.getTime() < origin.getTime()) return null;

  const probe = { ...goal, archived: false };
  for (let offset = 0; offset <= 400; offset++) {
    const candidate = addDays(end, -offset);
    if (candidate.getTime() < origin.getTime()) return null;
    if (goalOccursOn(probe, candidate)) return candidate;
  }
  return null;
}

export function nextOccurrenceAfter(goal: Goal, day: Date): Date | null {
  const probe = { ...goal, archived: false };
  for (let offset = 1; offset <= 400; offset++) {
    const candidate = addDays(startOfDay(day), offset);
    if (goalOccursOn(probe, candidate)) return candidate;
  }
  return null;
}

/**
 * Anımsatıcı ancak tarih/saat yoksa ya da belirlenen zaman geçtiyse
 * tamamlanabilir. Tekrarlıysa bir önceki tekrar da gecikmiş sayılır.
 */
export function canCompleteReminder(goal: Goal, now = new Date()): boolean {
  if (goal.type !== 'reminder' || goal.archived) return false;
  if (goal.repeat && goal.lastCompletedDate === todayIso()) return false;

  const hasDate = !!goal.date;
  const hasTime = !!goal.time;
  if (!hasDate && !hasTime) return true;

  if (goal.repeat) {
    const last = lastOccurrenceOnOrBefore(goal, startOfToday());
    if (!last) return false;
    if (goal.lastCompletedDate === toIsoDay(last)) return false;
    return now.getTime() >= applyClock(last, goal.time).getTime();
  }

  const day = parseGoalDate(goal.date) ?? startOfToday();
  return now.getTime() >= applyClock(day, goal.time).getTime();
}

export function describeNextReminder(goal: Goal): string {
  const next = nextOccurrenceAfter(goal, startOfToday());
  if (!next) return 'Bugün tamamlandı.';

  const when = [formatDisplayDate(next), goal.time].filter(Boolean).join(' · ');
  const repeat = goal.repeat;
  if (repeat?.unit === 'gun' && repeat.interval === 1) {
    return 'Bugün tamamlandı. Yarın tekrar gelecek.';
  }
  if (repeat?.unit === 'hafta' && repeat.interval === 1) {
    return `Bugün tamamlandı. Haftaya (${when}) tekrar gelecek.`;
  }
  return `Bugün tamamlandı. Sonraki: ${when}.`;
}
