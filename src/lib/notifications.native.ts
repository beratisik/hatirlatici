import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import type { Goal, Rank } from '@/context/GoalContext';
import { getRankNotificationContent } from '@/lib/rankNotifications';
import { MAX_WATER_SLOTS, parseClockTime } from '@/lib/water';

const RANK_REMINDER_ID = 'rank-daily-reminder';
const ANDROID_CHANNEL_ID = 'default';
const WATER_DATA_KEY = 'water';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export { getRankNotificationContent };

function goalAlarmId(goalId: string) {
  return `goal-alarm-${goalId}`;
}

function parseClock(time: string): { hour: number; minute: number } | null {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return null;
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function parseDisplayDate(value: string): Date | null {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);
  if (!match) return null;
  const parsed = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: 'Hatırlatıcı',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
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

export async function cancelGoalAlarm(goalId: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(goalAlarmId(goalId));
  } catch {
    // Yoksa sessiz geç.
  }
}

export async function scheduleGoalAlarm(goal: Goal): Promise<void> {
  try {
    await cancelGoalAlarm(goal.id);
    if (goal.archived || !goal.time) return;

    const granted = await requestNotificationPermission();
    if (!granted) return;

    const clock = parseClock(goal.time);
    if (!clock) return;

    const content = {
      title: 'Hedef saatin geldi.',
      body: `${goal.title} — bahanen bitti. Şimdi yap.`,
      sound: true as const,
      data: { goalId: goal.id },
    };

    if (goal.repeat) {
      await Notifications.scheduleNotificationAsync({
        identifier: goalAlarmId(goal.id),
        content,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: clock.hour,
          minute: clock.minute,
          channelId: ANDROID_CHANNEL_ID,
        },
      });
      return;
    }

    const day = parseDisplayDate(goal.date) ?? new Date();
    const fireAt = new Date(
      day.getFullYear(),
      day.getMonth(),
      day.getDate(),
      clock.hour,
      clock.minute,
      0,
      0,
    );
    if (fireAt.getTime() <= Date.now()) return;

    await Notifications.scheduleNotificationAsync({
      identifier: goalAlarmId(goal.id),
      content,
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireAt,
        channelId: ANDROID_CHANNEL_ID,
      },
    });
  } catch {
    // Web / izin reddi.
  }
}

export async function syncGoalAlarms(goals: Goal[]): Promise<void> {
  await Promise.all(goals.map((goal) => scheduleGoalAlarm(goal)));
}

export async function presentStreakCoachNotification(title: string, body: string): Promise<void> {
  try {
    const granted = await requestNotificationPermission();
    if (!granted) return;
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: true,
      },
      trigger: null,
    });
  } catch {
    // Native dışında yok say.
  }
}

function waterReminderId(index: number) {
  return `water-reminder-${index}`;
}

export async function cancelWaterReminders(): Promise<void> {
  for (let index = 0; index < MAX_WATER_SLOTS; index++) {
    try {
      await Notifications.cancelScheduledNotificationAsync(waterReminderId(index));
    } catch {
      // Zaten yoksa sessiz geç.
    }
  }
}

export async function syncWaterReminders(slots: string[], sipMl: number): Promise<void> {
  try {
    await cancelWaterReminders();
    if (slots.length === 0) return;

    const granted = await requestNotificationPermission();
    if (!granted) return;

    await Promise.all(
      slots.slice(0, MAX_WATER_SLOTS).map(async (slot, index) => {
        const clock = parseClockTime(slot);
        if (!clock) return;

        await Notifications.scheduleNotificationAsync({
          identifier: waterReminderId(index),
          content: {
            title: 'Su içme saati.',
            body: `${sipMl} ml iç ve uygulamada işaretle. İşaretlemezsen hedeften düşmez.`,
            sound: true,
            data: { [WATER_DATA_KEY]: true },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour: clock.hour,
            minute: clock.minute,
            channelId: ANDROID_CHANNEL_ID,
          },
        });
      }),
    );
  } catch {
    // Web / izin reddi.
  }
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
        sound: true,
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
