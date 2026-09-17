import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { padDatePart, type Goal } from '@/context/GoalContext';
import {
  addDays,
  goalsOnDay,
  isSameDay,
  startOfToday,
  startOfWeekMonday,
  weekDays,
} from '@/lib/schedule';

const WEEKDAY_LABELS = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'];
const MONTH_NAMES = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
];

export function formatDayHeading(day: Date): string {
  return `${padDatePart(day.getDate())} ${MONTH_NAMES[day.getMonth()].toUpperCase()} ${day.getFullYear()}`;
}

function weekLabel(weekStart: Date): string {
  const weekEnd = addDays(weekStart, 6);
  if (weekStart.getMonth() === weekEnd.getMonth()) {
    return `${weekStart.getDate()}–${weekEnd.getDate()} ${MONTH_NAMES[weekStart.getMonth()]}`;
  }
  return `${weekStart.getDate()} ${MONTH_NAMES[weekStart.getMonth()]} – ${weekEnd.getDate()} ${MONTH_NAMES[weekEnd.getMonth()]}`;
}

export function HomeCalendar({
  goals,
  selectedDay,
  onSelectDay,
}: {
  goals: Goal[];
  selectedDay: Date;
  onSelectDay: (day: Date) => void;
}) {
  const today = startOfToday();
  const weekStart = startOfWeekMonday(selectedDay);
  const days = weekDays(weekStart);

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <View style={styles.navRow}>
          <TouchableOpacity
            style={styles.navHit}
            activeOpacity={0.7}
            onPress={() => onSelectDay(addDays(selectedDay, -7))}>
            <Text style={styles.navText}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.weekLabel}>{weekLabel(weekStart)}</Text>
          <TouchableOpacity
            style={styles.navHit}
            activeOpacity={0.7}
            onPress={() => onSelectDay(addDays(selectedDay, 7))}>
            <Text style={styles.navText}>›</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.weekRow}>
        {days.map((day, index) => {
          const selected = isSameDay(day, selectedDay);
          const isToday = isSameDay(day, today);
          const count = goalsOnDay(goals, day).length;
          return (
            <TouchableOpacity
              key={day.toISOString()}
              style={styles.dayHit}
              activeOpacity={0.8}
              onPress={() => onSelectDay(day)}>
              <Text style={[styles.weekday, selected && styles.weekdaySelected]}>
                {WEEKDAY_LABELS[index]}
              </Text>
              <View
                style={[
                  styles.dayCircle,
                  isToday && styles.dayCircleToday,
                  selected && styles.dayCircleSelected,
                ]}>
                <Text
                  style={[
                    styles.dayNumber,
                    isToday && styles.dayNumberToday,
                    selected && styles.dayNumberSelected,
                  ]}>
                  {day.getDate()}
                </Text>
              </View>
              <View style={[styles.dot, count > 0 ? styles.dotActive : styles.dotEmpty]} />
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity
        style={styles.todayHit}
        activeOpacity={0.75}
        onPress={() => onSelectDay(today)}>
        <Text style={styles.todayLabel}>BUGÜNE DÖN</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 12,
    gap: 12,
  },
  header: {
    paddingHorizontal: 4,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navHit: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navText: {
    color: '#F5F5F5',
    fontSize: 22,
    fontWeight: '700',
  },
  weekLabel: {
    color: '#F2F2F2',
    fontSize: 15,
    fontWeight: '800',
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dayHit: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  weekday: {
    color: '#6B6B6B',
    fontSize: 11,
    fontWeight: '700',
  },
  weekdaySelected: {
    color: '#C1121F',
  },
  dayCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  dayCircleToday: {
    borderColor: '#C1121F',
  },
  dayCircleSelected: {
    backgroundColor: '#C1121F',
    borderColor: '#C1121F',
  },
  dayNumber: {
    color: '#E4E4E4',
    fontSize: 14,
    fontWeight: '700',
  },
  dayNumberToday: {
    color: '#C1121F',
  },
  dayNumberSelected: {
    color: '#FFFFFF',
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  dotActive: {
    backgroundColor: '#C1121F',
  },
  dotEmpty: {
    backgroundColor: 'transparent',
  },
  todayHit: {
    alignSelf: 'center',
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  todayLabel: {
    color: '#8A8A8A',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
});
