import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { padDatePart, type Goal } from '@/context/GoalContext';
import {
  addMonths,
  goalsOnDay,
  isSameDay,
  monthGridDays,
  startOfMonth,
  startOfToday,
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

function monthLabel(day: Date): string {
  return `${MONTH_NAMES[day.getMonth()]} ${day.getFullYear()}`;
}

function shiftMonth(selectedDay: Date, amount: number): Date {
  const nextMonth = addMonths(startOfMonth(selectedDay), amount);
  const today = startOfToday();
  if (today.getFullYear() === nextMonth.getFullYear() && today.getMonth() === nextMonth.getMonth()) {
    return today;
  }
  return nextMonth;
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
  const cells = monthGridDays(selectedDay);

  return (
    <View style={styles.wrap}>
      <View style={styles.navRow}>
        <TouchableOpacity
          style={styles.navHit}
          activeOpacity={0.7}
          onPress={() => onSelectDay(shiftMonth(selectedDay, -1))}>
          <Text style={styles.navText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{monthLabel(selectedDay)}</Text>
        <TouchableOpacity
          style={styles.navHit}
          activeOpacity={0.7}
          onPress={() => onSelectDay(shiftMonth(selectedDay, 1))}>
          <Text style={styles.navText}>›</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAY_LABELS.map((label) => (
          <View key={label} style={styles.weekCell}>
            <Text style={styles.weekday}>{label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((day, index) => {
          if (!day) {
            return <View key={`empty-${index}`} style={styles.dayHit} />;
          }

          const selected = isSameDay(day, selectedDay);
          const isToday = isSameDay(day, today);
          const hasGoals = goalsOnDay(goals, day).length > 0;

          return (
            <TouchableOpacity
              key={day.toISOString()}
              style={styles.dayHit}
              activeOpacity={0.8}
              onPress={() => onSelectDay(day)}>
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
              <View style={[styles.dot, hasGoals ? styles.dotActive : styles.dotEmpty]} />
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
    paddingHorizontal: 10,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 8,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
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
  monthLabel: {
    color: '#F2F2F2',
    fontSize: 16,
    fontWeight: '800',
  },
  weekRow: {
    flexDirection: 'row',
  },
  weekCell: {
    width: `${100 / 7}%`,
    alignItems: 'center',
    paddingBottom: 4,
  },
  weekday: {
    color: '#6B6B6B',
    fontSize: 11,
    fontWeight: '700',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayHit: {
    width: `${100 / 7}%`,
    alignItems: 'center',
    paddingVertical: 4,
    gap: 3,
  },
  dayCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
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
    fontSize: 13,
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
