import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import type { Rank } from '@/context/GoalContext';
import { getRankNotificationContent } from '@/lib/rankNotifications';

const RANK_REMINDER_ID = 'rank-daily-reminder';
const ANDROID_CHANNEL_ID = 'default';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export { getRankNotificationContent };

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: 'Hatırlatıcı',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const asked = await Notifications.requestPermissionsAsync();
    status = asked.status;
  }
  return status === 'granted';
}

export async function syncRankReminder(rank: Rank): Promise<void> {
  try {
    const granted = await requestNotificationPermission();
    if (!granted) return;

    const content = getRankNotificationContent(rank);
    await Notifications.cancelScheduledNotificationAsync(RANK_REMINDER_ID);
    await Notifications.scheduleNotificationAsync({
      identifier: RANK_REMINDER_ID,
      content: {
        title: content.title,
        body: content.body,
        data: { rank: rank.title },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 9,
        minute: 0,
        channelId: ANDROID_CHANNEL_ID,
      },
    });
  } catch {
    // İzin reddi veya emülatör kısıtlarında sessizce geç.
  }
}
