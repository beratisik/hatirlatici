import type { Rank } from '@/context/GoalContext';

export { getRankNotificationContent } from '@/lib/rankNotifications';

export async function requestNotificationPermission(): Promise<boolean> {
  return false;
}

export async function syncRankReminder(_rank: Rank): Promise<void> {}
