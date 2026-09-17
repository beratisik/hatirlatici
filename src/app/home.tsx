import { useMemo, useRef, useState } from 'react';
import { FlatList, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';

import {
  formatRepeatSummary,
  getConfrontationMessage,
  isCompletedToday,
  isHandledToday,
  isTimeEditLocked,
  OUTCOME_POINTS,
  useGoals,
  type Goal,
  type GoalOutcome,
} from '@/context/GoalContext';
import { ConfrontationModal } from '@/components/confrontation-modal';
import { formatDayHeading, HomeCalendar } from '@/components/home-calendar';
import {
  confirmDeleteGoal,
  confirmFinishGoal,
  confirmPauseGoal,
  CoachLockModal,
  GoalMenuButton,
  GoalMenuSheet,
} from '@/components/goal-menu';
import { goalsOnDay, startOfToday } from '@/lib/schedule';

export default function HomeScreen() {
  const router = useRouter();
  const { profile: profileParam } = useLocalSearchParams<{ profile?: string }>();
  const { goals, completeGoal, archiveGoal, pauseGoal, finishGoal, deleteGoal, score, profile } = useGoals();
  const [menuGoal, setMenuGoal] = useState<Goal | null>(null);
  const [lockWarning, setLockWarning] = useState(false);
  const [confrontation, setConfrontation] = useState<{ streak: number; message: string } | null>(
    null,
  );
  const [selectedDay, setSelectedDay] = useState(() => startOfToday());
  const [calendarVisible, setCalendarVisible] = useState(false);

  const activeGoals = goals.filter((goal) => !goal.archived);
  const dayGoals = useMemo(() => {
    return goalsOnDay(activeGoals, selectedDay).slice().sort((a, b) => {
      if (a.time && b.time) return a.time.localeCompare(b.time);
      if (a.time) return -1;
      if (b.time) return 1;
      return a.title.localeCompare(b.title);
    });
  }, [activeGoals, selectedDay]);
  const archivedCount = goals.filter((goal) => goal.archived).length;
  const profileKey = profileParam || profile || '';

  function handleAddGoal() {
    router.push({ pathname: '/new-goal', params: { profile: profileKey } });
  }

  function handleCoachPlan() {
    router.push('/coach-plan');
  }

  function handleOpenProfile() {
    router.push('/profile');
  }

  function handleOpenArchive() {
    router.push('/archive');
  }

  function handleOpenCalendar() {
    setSelectedDay(startOfToday());
    setCalendarVisible(true);
  }

  function handleComplete(goal: Goal) {
    handleOutcome(goal.id, 'onTime');
  }

  function handleOutcome(id: string, outcome: GoalOutcome) {
    const result = completeGoal(id, outcome);
    if (!result.applied) return;
    if (outcome === 'missed') return;
    setConfrontation({
      streak: result.streak,
      message: result.message ?? getConfrontationMessage(result.streak, result.bonus),
    });
  }

  function handleOpenMenu(goal: Goal) {
    if (isTimeEditLocked(goal)) {
      setLockWarning(true);
    }
    setMenuGoal(goal);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>HEDEFLERİM</Text>
          <Text style={styles.headerCount}>
            {activeGoals.length > 0 ? `${activeGoals.length} aktif hedef` : ''}
          </Text>
        </View>

        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.archiveButton}
            activeOpacity={0.8}
            onPress={handleOpenArchive}>
            <Text style={styles.archiveButtonLabel}>ARŞİV</Text>
            {archivedCount > 0 && (
              <Text style={styles.archiveButtonCount}>{archivedCount}</Text>
            )}
          </TouchableOpacity>
          <View style={styles.scoreBadge}>
            <Text style={styles.scoreBadgeLabel}>DİSİPLİN</Text>
            <Text style={[styles.scoreBadgeValue, score < 0 && styles.scoreBadgeValueNegative]}>
              {score}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.profileButton}
            activeOpacity={0.8}
            onPress={handleOpenProfile}>
            <Text style={styles.profileButtonIcon}>👤</Text>
          </TouchableOpacity>
        </View>
      </View>

      {activeGoals.length > 0 && (
        <Text style={styles.swipeHint}>
          ← Sola kaydır: Yapmadım / Arşivle · Sağa kaydır: Yaptım / Geç yaptım →
        </Text>
      )}

      <FlatList
        data={activeGoals}
        keyExtractor={(item) => item.id}
        contentContainerStyle={activeGoals.length === 0 ? styles.emptyListContent : styles.listContent}
        renderItem={({ item }) => (
          <GoalCard
            goal={item}
            onComplete={() => handleComplete(item)}
            onOutcome={handleOutcome}
            onArchive={(id) => archiveGoal(id)}
            onOpenMenu={() => handleOpenMenu(item)}
          />
        )}
        ListEmptyComponent={
          archivedCount > 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>AKTİF HEDEFİN YOK</Text>
              <Text style={styles.emptySubtitle}>
                Duraklattığın veya bitirdiğin görevler Arşiv’de. Serin silinmedi.
              </Text>
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>HENÜZ HEDEFİN YOK!</Text>
              <Text style={styles.emptySubtitle}>
                Hedef ekle ya da koçtan bir plan al. Bahanen hazırsa dokunma.
              </Text>
            </View>
          )
        }
      />

      <View style={styles.fabRow}>
        <TouchableOpacity style={styles.coachFab} activeOpacity={0.85} onPress={handleCoachPlan}>
          <Text style={styles.coachFabLabel}>KOÇTAN PLAN AL</Text>
        </TouchableOpacity>
        <View style={styles.fabColumn}>
          <TouchableOpacity
            style={styles.calendarFab}
            activeOpacity={0.85}
            onPress={handleOpenCalendar}>
            <Text style={styles.calendarFabIcon}>📅</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.fab} activeOpacity={0.8} onPress={handleAddGoal}>
            <Text style={styles.fabIcon}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal
        visible={calendarVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCalendarVisible(false)}>
        <View style={styles.calendarOverlay}>
          <TouchableOpacity
            style={styles.calendarBackdrop}
            activeOpacity={1}
            onPress={() => setCalendarVisible(false)}
          />
          <View style={styles.calendarSheet}>
            <View style={styles.calendarSheetHeader}>
              <Text style={styles.calendarSheetTitle}>TAKVİM</Text>
              <TouchableOpacity activeOpacity={0.7} onPress={() => setCalendarVisible(false)}>
                <Text style={styles.calendarClose}>Kapat</Text>
              </TouchableOpacity>
            </View>
            <HomeCalendar
              goals={activeGoals}
              selectedDay={selectedDay}
              onSelectDay={setSelectedDay}
            />
            <Text style={styles.dayHeading}>
              {formatDayHeading(selectedDay)}
              {dayGoals.length > 0 ? ` · ${dayGoals.length} iş` : ''}
            </Text>
            <ScrollView style={styles.dayList} contentContainerStyle={styles.dayListContent}>
              {dayGoals.length === 0 ? (
                <Text style={styles.dayEmpty}>Bu günde işin yok.</Text>
              ) : (
                dayGoals.map((goal) => (
                  <View key={goal.id} style={styles.dayItem}>
                    <Text style={styles.dayItemTitle}>{goal.title}</Text>
                    <Text style={styles.dayItemMeta}>
                      {[goal.time, formatRepeatSummary(goal.repeat)].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <GoalMenuSheet
        visible={!!menuGoal}
        onClose={() => setMenuGoal(null)}
        onEdit={
          menuGoal
            ? () => {
                if (isTimeEditLocked(menuGoal)) {
                  setLockWarning(true);
                  return;
                }
                router.push({
                  pathname: '/new-goal',
                  params: { profile: profileKey, id: menuGoal.id },
                });
              }
            : undefined
        }
        onPause={
          menuGoal
            ? () =>
                confirmPauseGoal(menuGoal.title, () => pauseGoal(menuGoal.id))
            : undefined
        }
        onFinish={
          menuGoal
            ? () =>
                confirmFinishGoal(menuGoal.title, () => {
                  const finished = finishGoal(menuGoal.id);
                  if (finished) {
                    router.push({ pathname: '/report-card', params: { id: finished.id } });
                  }
                })
            : undefined
        }
        onDelete={() => {
          if (!menuGoal) return;
          confirmDeleteGoal(menuGoal.title, () => deleteGoal(menuGoal.id));
        }}
      />

      <CoachLockModal visible={lockWarning} onClose={() => setLockWarning(false)} />

      <ConfrontationModal
        visible={!!confrontation}
        streak={confrontation?.streak ?? 0}
        message={confrontation?.message ?? ''}
        onClose={() => setConfrontation(null)}
      />
    </SafeAreaView>
  );
}

function GoalCard({
  goal,
  onComplete,
  onOutcome,
  onArchive,
  onOpenMenu,
}: {
  goal: Goal;
  onComplete: () => void;
  onOutcome: (id: string, outcome: GoalOutcome) => void;
  onArchive: (id: string) => void;
  onOpenMenu: () => void;
}) {
  const swipeableRef = useRef<Swipeable>(null);
  const hasSchedule = !!(goal.date || goal.time);
  const repeatLabel = formatRepeatSummary(goal.repeat);
  const handledToday = isHandledToday(goal);
  const completedToday = isCompletedToday(goal);
  const missedToday = handledToday && goal.lastOutcome === 'missed';
  const slotLabel =
    goal.timeSlot === 'sabah'
      ? 'Sabah'
      : goal.timeSlot === 'ogle'
        ? 'Öğle'
        : goal.timeSlot === 'aksam'
          ? 'Akşam'
          : null;

  function runAction(action: () => void) {
    swipeableRef.current?.close();
    action();
  }

  return (
    <Swipeable
      ref={swipeableRef}
      overshootLeft={false}
      overshootRight={false}
      friction={2}
      renderLeftActions={
        handledToday
          ? undefined
          : () => (
              <View style={styles.leftActions}>
                <TouchableOpacity
                  style={[styles.actionButton, styles.actionOnTime]}
                  activeOpacity={0.85}
                  onPress={() => runAction(() => onOutcome(goal.id, 'onTime'))}>
                  <Text style={styles.actionLabel}>YAPTIM</Text>
                  <Text style={styles.actionPoints}>+{OUTCOME_POINTS.onTime}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, styles.actionLate]}
                  activeOpacity={0.85}
                  onPress={() => runAction(() => onOutcome(goal.id, 'late'))}>
                  <Text style={styles.actionLabel}>GEÇ{'\n'}YAPTIM</Text>
                  <Text style={styles.actionPoints}>+{OUTCOME_POINTS.late}</Text>
                </TouchableOpacity>
              </View>
            )
      }
      renderRightActions={() => (
        <View style={styles.rightActions}>
          {!handledToday && (
            <TouchableOpacity
              style={[styles.actionButton, styles.actionMissed]}
              activeOpacity={0.85}
              onPress={() => runAction(() => onOutcome(goal.id, 'missed'))}>
              <Text style={styles.actionLabel}>YAPMADIM</Text>
              <Text style={styles.actionPoints}>{OUTCOME_POINTS.missed}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.actionButton, styles.actionArchive]}
            activeOpacity={0.85}
            onPress={() => runAction(() => onArchive(goal.id))}>
            <Text style={styles.actionLabel}>ARŞİVLE</Text>
          </TouchableOpacity>
        </View>
      )}>
      <View style={[styles.card, handledToday && styles.cardDone]}>
        <View style={styles.cardTopRow}>
          <Text style={[styles.cardTitle, completedToday && styles.cardTitleDone]}>{goal.title}</Text>
          <GoalMenuButton onPress={onOpenMenu} />
        </View>

        {!!goal.description && (
          <Text style={[styles.cardDescription, completedToday && styles.cardTitleDone]}>
            {goal.description}
          </Text>
        )}

        {completedToday && (
          <Text style={styles.doneHint}>Bugün tamamlandı. Yarın gelmeden tekrar işaretlenemez.</Text>
        )}
        {missedToday && (
          <Text style={styles.missedHint}>Bugün yapılmadı. Yarın gelmeden tekrar işaretlenemez.</Text>
        )}

        <View style={styles.cardFooter}>
          {hasSchedule && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {[goal.date, goal.time].filter(Boolean).join(' • ')}
              </Text>
            </View>
          )}
          {slotLabel && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{slotLabel}</Text>
            </View>
          )}
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{repeatLabel}</Text>
          </View>
          {!!goal.endDate && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Bitiş {goal.endDate}</Text>
            </View>
          )}
          {goal.repeat && goal.streak > 0 && (
            <View style={styles.badge}>
              <Text style={styles.streakBadgeText}>🔥 {goal.streak} seri</Text>
            </View>
          )}
        </View>

        {!handledToday && (
          <TouchableOpacity style={styles.completeButton} activeOpacity={0.85} onPress={onComplete}>
            <Text style={styles.completeButtonLabel}>TAMAMLA</Text>
          </TouchableOpacity>
        )}
      </View>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#050505',
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerTitle: {
    color: '#F5F5F5',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 1,
  },
  headerCount: {
    color: '#8A8A8A',
    fontSize: 13,
    fontWeight: '600',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  archiveButton: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: 'center',
    minWidth: 52,
  },
  archiveButtonLabel: {
    color: '#C8C8C8',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  archiveButtonCount: {
    color: '#8A8A8A',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 1,
  },
  scoreBadge: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
  },
  scoreBadgeLabel: {
    color: '#7A7A7A',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
  },
  scoreBadgeValue: {
    color: '#3DDC84',
    fontSize: 16,
    fontWeight: '800',
  },
  scoreBadgeValueNegative: {
    color: '#FF5C5C',
  },
  profileButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileButtonIcon: {
    fontSize: 18,
  },
  swipeHint: {
    color: '#6B6B6B',
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
    paddingHorizontal: 24,
    paddingBottom: 10,
  },
  calendarOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  calendarBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.62)',
  },
  calendarSheet: {
    backgroundColor: '#0B0B0B',
    borderTopWidth: 1,
    borderColor: '#2A2A2A',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 28,
    maxHeight: '82%',
    gap: 12,
  },
  calendarSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  calendarSheetTitle: {
    color: '#F2F2F2',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  calendarClose: {
    color: '#C1121F',
    fontSize: 14,
    fontWeight: '700',
  },
  dayHeading: {
    color: '#F2F2F2',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
    paddingHorizontal: 4,
  },
  dayList: {
    maxHeight: 280,
  },
  dayListContent: {
    gap: 8,
    paddingBottom: 8,
  },
  dayEmpty: {
    color: '#8A8A8A',
    fontSize: 14,
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  dayItem: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  dayItemTitle: {
    color: '#F5F5F5',
    fontSize: 15,
    fontWeight: '700',
  },
  dayItemMeta: {
    color: '#8A8A8A',
    fontSize: 12,
    fontWeight: '500',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 140,
    gap: 14,
  },
  emptyListContent: {
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyTitle: {
    color: '#F5F5F5',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 1,
    textAlign: 'center',
  },
  emptySubtitle: {
    color: '#8A8A8A',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#151515',
    borderWidth: 1,
    borderColor: '#262626',
    borderRadius: 14,
    padding: 18,
    gap: 10,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardTitle: {
    flex: 1,
    color: '#F5F5F5',
    fontSize: 17,
    fontWeight: '700',
  },
  cardTitleDone: {
    textDecorationLine: 'line-through',
    color: '#6B6B6B',
  },
  cardDone: {
    opacity: 0.72,
  },
  doneHint: {
    color: '#3DDC84',
    fontSize: 12,
    fontWeight: '600',
  },
  missedHint: {
    color: '#FF5C5C',
    fontSize: 12,
    fontWeight: '600',
  },
  cardDescription: {
    color: '#9A9A9A',
    fontSize: 14,
    lineHeight: 20,
  },
  cardFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  badge: {
    backgroundColor: '#1F1F1F',
    borderWidth: 1,
    borderColor: '#2E2E2E',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgeText: {
    color: '#C7C7C7',
    fontSize: 12,
    fontWeight: '600',
  },
  streakBadgeText: {
    color: '#C1121F',
    fontSize: 12,
    fontWeight: '800',
  },
  completeButton: {
    marginTop: 6,
    backgroundColor: '#C1121F',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  completeButtonLabel: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  leftActions: {
    flexDirection: 'row',
    marginRight: -1,
  },
  rightActions: {
    flexDirection: 'row',
  },
  actionButton: {
    width: 104,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 8,
    borderRadius: 14,
    marginHorizontal: 3,
  },
  actionOnTime: {
    backgroundColor: '#1F7A3D',
  },
  actionLate: {
    backgroundColor: '#B8860B',
  },
  actionMissed: {
    backgroundColor: '#7A1414',
  },
  actionArchive: {
    backgroundColor: '#2E2E2E',
  },
  actionLabel: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  actionPoints: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  fabRow: {
    position: 'absolute',
    right: 24,
    bottom: 32,
    left: 24,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    gap: 10,
  },
  fabColumn: {
    alignItems: 'center',
    gap: 10,
  },
  calendarFab: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#C1121F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarFabIcon: {
    fontSize: 20,
  },
  coachFab: {
    flex: 1,
    height: 52,
    borderRadius: 10,
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#C1121F',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  coachFabLabel: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  fab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#C1121F',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 8,
  },
  fabIcon: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '800',
    lineHeight: 34,
  },
});
