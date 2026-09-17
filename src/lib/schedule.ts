import {
  parseGoalDate,
  startOfToday,
  type Goal,
} from '@/context/GoalContext';

export { startOfToday };

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
