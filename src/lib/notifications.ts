import type { Goal, Rank } from '@/context/GoalContext';

export { getRankNotificationContent } from '@/lib/rankNotifications';

export async function requestNotificationPermission(): Promise<boolean> {
  return false;
}

export async function cancelGoalAlarm(_goalId: string): Promise<void> {}

export async function scheduleGoalAlarm(_goal: Goal): Promise<void> {}

export async function syncGoalAlarms(_goals: Goal[]): Promise<void> {}

export async function presentStreakCoachNotification(_title: string, _body: string): Promise<void> {}

export async function syncRankReminder(_rank: Rank): Promise<void> {}
