import { useMemo, useRef, useState } from 'react';
import { FlatList, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';

import {
  formatGoalCadence,
  formatScoreLadderRange,
  formatTimeRange,
  getConfrontationMessage,
  getRankName,
  GOAL_TYPE_COLORS,
  isCompletedToday,
  isHandledToday,
  isRepeating,
  isReminderDoneToday,
  isStreakAtRisk,
  isTimeEditLocked,
  OUTCOME_POINTS,
  SCORE_LADDER,
  useGoals,
  useUser,
  useWater,
  type Goal,
  type GoalOutcome,
  type WaterSummary,
} from '@/context/GoalContext';
import { AppDrawer, DrawerToggleButton, type DrawerAction } from '@/components/app-drawer';
import { CycleMark } from '@/components/cycle-mark';
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
import { canCompleteReminder, describeNextReminder, goalOccursOn, goalsOnDay, startOfToday } from '@/lib/schedule';
import { formatLiters, nextSlotAfter } from '@/lib/water';

export default function HomeScreen() {
  const router = useRouter();
  const { profile: profileParam } = useLocalSearchParams<{ profile?: string }>();
  const { goals, completeGoal, completeReminder, archiveGoal, pauseGoal, finishGoal, deleteGoal, score, profile } =
    useGoals();
  const { water, logWater } = useWater();
  const { user } = useUser();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuGoal, setMenuGoal] = useState<Goal | null>(null);
  const [lockWarning, setLockWarning] = useState(false);
  const [confrontation, setConfrontation] = useState<{ streak: number; message: string } | null>(
    null,
  );
  const [selectedDay, setSelectedDay] = useState(() => startOfToday());
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [rankVisible, setRankVisible] = useState(false);
  const rankName = getRankName(score);

  const activeGoals = goals.filter((goal) => !goal.archived);
  const todayGoals = activeGoals.filter(
    (goal) => !goal.daysOfWeek?.length || goalOccursOn(goal, startOfToday()),
  );
  const coachCount = activeGoals.filter((goal) => goal.type === 'coach').length;
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

  const drawerActions: DrawerAction[] = [
    {
      id: 'reminder',
      icon: '🔔',
      label: 'Anımsatıcı Ekle',
      hint: 'Başlık, not, tarih ve saat. Puan yok, sadece hatırlatma.',
      accent: GOAL_TYPE_COLORS.reminder,
      onPress: () => router.push({ pathname: '/new-goal', params: { profile: profileKey } }),
    },
    {
      id: 'coach',
      icon: '🔥',
      label: 'Koç’tan Plan Al',
      hint: 'Koçla yazış. Bahanen bitince görev kilitlenir.',
      accent: GOAL_TYPE_COLORS.coach,
      onPress: () => router.push('/coach-plan'),
    },
    ...(user?.gender === 'kadin'
      ? [
          {
            id: 'cycle',
            icon: <CycleMark size={20} color="#C1121F" />,
            label: 'Döngü Takibi',
            hint: 'Adet tahmini, kalan gün ve gecikme.',
            accent: '#C1121F',
            onPress: () => router.push('/cycle'),
          } satisfies DrawerAction,
        ]
      : []),
  ];

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

  function handleOpenWater() {
    router.push('/water');
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
    if (goal.type === 'coach' && isTimeEditLocked(goal)) {
      setLockWarning(true);
    }
    setMenuGoal(goal);
  }

  function handleEditFromMenu() {
    if (!menuGoal) return;
    if (menuGoal.type === 'coach' && isTimeEditLocked(menuGoal)) {
      setLockWarning(true);
      return;
    }
    router.push({ pathname: '/new-goal', params: { profile: profileKey, id: menuGoal.id } });
  }

  return (
    <AppDrawer
      open={drawerOpen}
      onOpen={() => setDrawerOpen(true)}
      onClose={() => setDrawerOpen(false)}
      actions={drawerActions}>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />

        <View style={styles.header}>
          <View style={styles.headerRow}>
            <DrawerToggleButton onPress={() => setDrawerOpen(true)} />
            <View style={styles.headerActions}>
              <IconButton icon="📅" label="Takvim" onPress={handleOpenCalendar} />
              <IconButton
                icon="📦"
                label="Arşiv"
                onPress={handleOpenArchive}
                badge={archivedCount}
              />
              <IconButton icon="👤" label="Profil" onPress={handleOpenProfile} />
            </View>
          </View>

          <Text style={styles.headerTitle}>HEDEFLERİM</Text>
          {activeGoals.length > 0 ? (
            <Text style={styles.headerMeta}>{activeGoals.length} aktif kayıt</Text>
          ) : null}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setRankVisible(true)}
            accessibilityRole="button"
            accessibilityLabel={`${rankName}, ${score} puan. Rütbe listesini aç.`}>
            <Text style={[styles.headerScore, score < 0 && styles.headerScoreNegative]}>
              [{rankName}] • {score} Puan
            </Text>
          </TouchableOpacity>
        </View>

        <WaterStrip water={water} onOpen={handleOpenWater} onDrink={logWater} />

        {coachCount > 0 && (
          <View style={styles.swipeBanner}>
            <Text style={styles.swipeHint}>
              Koç kartlarında: ← Yapmadım / Arşivle · Yaptım / Geç yaptım →
            </Text>
          </View>
        )}

        <FlatList
          data={todayGoals}
          keyExtractor={(item) => item.id}
          contentContainerStyle={
            todayGoals.length === 0 ? styles.emptyListContent : styles.listContent
          }
          renderItem={({ item }) =>
            item.type === 'coach' ? (
              <CoachCard
                goal={item}
                onOutcome={handleOutcome}
                onArchive={archiveGoal}
                onOpenMenu={() => handleOpenMenu(item)}
              />
            ) : (
              <ReminderCard
                goal={item}
                onOpenMenu={() => handleOpenMenu(item)}
                onComplete={() => completeReminder(item.id)}
              />
            )
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>
                {activeGoals.length > 0
                  ? 'BUGÜN İŞİN YOK'
                  : archivedCount > 0
                    ? 'AKTİF KAYDIN YOK'
                    : 'HENÜZ KAYDIN YOK!'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {activeGoals.length > 0
                  ? 'Bu gün için planlı görev yok. Diğer günler takvimde duruyor.'
                  : archivedCount > 0
                    ? 'Duraklattığın veya bitirdiğin kayıtlar Arşiv’de. Serin silinmedi.'
                    : 'Soldan menüyü aç: anımsatıcı ekle ya da koçla yazış.'}
              </Text>
              <TouchableOpacity
                style={styles.emptyButton}
                activeOpacity={0.85}
                onPress={() => setDrawerOpen(true)}>
                <Text style={styles.emptyButtonLabel}>MENÜYÜ AÇ</Text>
              </TouchableOpacity>
            </View>
          }
        />

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
                    <View
                      key={goal.id}
                      style={[styles.dayItem, { borderLeftColor: GOAL_TYPE_COLORS[goal.type] }]}>
                      <Text style={styles.dayItemTitle}>{goal.title}</Text>
                      <Text style={styles.dayItemMeta}>
                        {[
                          goal.type === 'coach' ? 'Koç' : 'Anımsatıcı',
                          formatTimeRange(goal.time, goal.endTime),
                          formatGoalCadence(goal),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    </View>
                  ))
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>

        <Modal
          visible={rankVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setRankVisible(false)}>
          <View style={styles.rankOverlay}>
            <TouchableOpacity
              style={styles.rankBackdrop}
              activeOpacity={1}
              onPress={() => setRankVisible(false)}
            />
            <View style={styles.rankSheet}>
              <View style={styles.rankSheetHeader}>
                <Text style={styles.rankSheetTitle}>RÜTBELER</Text>
                <TouchableOpacity
                  activeOpacity={0.7}
                  accessibilityLabel="Kapat"
                  onPress={() => setRankVisible(false)}>
                  <Text style={styles.rankClose}>✕</Text>
                </TouchableOpacity>
              </View>
              <ScrollView
                style={styles.rankList}
                contentContainerStyle={styles.rankListContent}
                showsVerticalScrollIndicator={false}>
                {SCORE_LADDER.map((rank) => {
                  const current = rank.name === rankName;
                  return (
                    <View
                      key={rank.name}
                      style={[styles.rankRow, current && styles.rankRowCurrent]}>
                      <View style={styles.rankRowCopy}>
                        <Text style={[styles.rankRowName, current && styles.rankRowNameCurrent]}>
                          {rank.name}
                        </Text>
                        <Text style={[styles.rankRowRange, current && styles.rankRowRangeCurrent]}>
                          {formatScoreLadderRange(rank)}
                        </Text>
                      </View>
                      {current ? <Text style={styles.rankHere}>Şu an buradasın</Text> : null}
                    </View>
                  );
                })}
              </ScrollView>
              <TouchableOpacity
                style={styles.rankDismiss}
                activeOpacity={0.85}
                onPress={() => setRankVisible(false)}>
                <Text style={styles.rankDismissLabel}>Kapat</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <GoalMenuSheet
          visible={!!menuGoal}
          onClose={() => setMenuGoal(null)}
          onEdit={handleEditFromMenu}
          onArchive={
            menuGoal?.type === 'reminder' ? () => archiveGoal(menuGoal.id) : undefined
          }
          onPause={
            menuGoal?.type === 'coach'
              ? () => confirmPauseGoal(menuGoal.title, () => pauseGoal(menuGoal.id))
              : undefined
          }
          onFinish={
            menuGoal?.type === 'coach'
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
    </AppDrawer>
  );
}

function IconButton({
  icon,
  label,
  onPress,
  badge = 0,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  badge?: number;
}) {
  return (
    <TouchableOpacity
      style={styles.iconButton}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}>
      <Text style={styles.iconButtonGlyph}>{icon}</Text>
      {badge > 0 && (
        <View style={styles.iconButtonBadge}>
          <Text style={styles.iconButtonBadgeText}>{badge}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function WaterStrip({
  water,
  onOpen,
  onDrink,
}: {
  water: WaterSummary;
  onOpen: () => void;
  onDrink: (ml: number) => void;
}) {
  if (!water.settings) {
    return (
      <TouchableOpacity style={styles.waterSetup} activeOpacity={0.85} onPress={onOpen}>
        <Text style={styles.waterSetupTitle}>💧 Su takibini kur</Text>
        <Text style={styles.waterSetupHint}>Boyunu ve kilonu gir, hedefini koç belirlesin.</Text>
      </TouchableOpacity>
    );
  }

  const done = water.remainingMl === 0;
  const nextSlot = nextSlotAfter(water.slots, new Date());

  return (
    <View style={styles.waterCard}>
      <TouchableOpacity style={styles.waterMain} activeOpacity={0.8} onPress={onOpen}>
        <View style={styles.waterTopRow}>
          <Text style={styles.waterTitle}>
            💧 SU{nextSlot && !done ? ` · sıradaki ${nextSlot}` : ''}
          </Text>
          <Text style={[styles.waterRemaining, done && styles.waterRemainingDone]}>
            {done ? 'Hedef tamam' : `${formatLiters(water.remainingMl)} kaldı`}
          </Text>
        </View>
        <View style={styles.waterTrack}>
          <View style={[styles.waterFill, { width: `${water.progress * 100}%` }]} />
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.waterDrinkButton}
        activeOpacity={0.85}
        onPress={() => onDrink(water.sipMl)}>
        <Text style={styles.waterDrinkValue}>+{water.sipMl}</Text>
      </TouchableOpacity>
    </View>
  );
}

function scheduleLine(goal: Goal): string {
  return [goal.date, formatTimeRange(goal.time, goal.endTime)].filter(Boolean).join(' · ');
}

/** Anımsatıcı: puan, seri ve swipe yok. Tamamlama yalnızca zamanı gelince. */
function ReminderCard({
  goal,
  onOpenMenu,
  onComplete,
}: {
  goal: Goal;
  onOpenMenu: () => void;
  onComplete: () => void;
}) {
  const schedule = scheduleLine(goal);
  const canComplete = canCompleteReminder(goal);
  const doneToday = isReminderDoneToday(goal);

  return (
    <View style={[styles.card, styles.reminderCard, doneToday && styles.cardDone]}>
      <TouchableOpacity style={styles.cardBodyHit} activeOpacity={0.85} onPress={onOpenMenu}>
        <View style={styles.cardTopRow}>
          <View style={styles.cardTitleBlock}>
            <Text style={styles.reminderKicker}>ANIMSATICI</Text>
            <Text style={[styles.cardTitle, doneToday && styles.cardTitleDone]}>{goal.title}</Text>
          </View>
          <GoalMenuButton onPress={onOpenMenu} />
        </View>

        {!!goal.description && (
          <Text style={[styles.cardDescription, doneToday && styles.cardTitleDone]}>
            {goal.description}
          </Text>
        )}
      </TouchableOpacity>

      {canComplete && (
        <TouchableOpacity style={styles.reminderCompleteButton} activeOpacity={0.85} onPress={onComplete}>
          <Text style={styles.reminderCompleteLabel}>TAMAMLANDI</Text>
        </TouchableOpacity>
      )}

      {doneToday && <Text style={styles.reminderDoneHint}>{describeNextReminder(goal)}</Text>}

      {!!schedule && <Text style={styles.cardSchedule}>{schedule}</Text>}

      <View style={styles.cardFooter}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{formatGoalCadence(goal)}</Text>
        </View>
        {!!goal.endDate && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Bitiş {goal.endDate}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

/** Koç hedefi: swipe ile sonuç işaretleme, puan ve seri burada. */
function CoachCard({
  goal,
  onOutcome,
  onArchive,
  onOpenMenu,
}: {
  goal: Goal;
  onOutcome: (id: string, outcome: GoalOutcome) => void;
  onArchive: (id: string) => void;
  onOpenMenu: () => void;
}) {
  const swipeableRef = useRef<Swipeable>(null);
  const schedule = [scheduleLine(goal), slotLabel(goal)].filter(Boolean).join(' · ');
  const handledToday = isHandledToday(goal);
  const completedToday = isCompletedToday(goal);
  const missedToday = handledToday && goal.lastOutcome === 'missed';
  const atRisk = isStreakAtRisk(goal);

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
      <View style={[styles.card, styles.coachCard, handledToday && styles.cardDone]}>
        <View style={styles.cardTopRow}>
          <View style={styles.cardTitleBlock}>
            <Text style={styles.coachKicker}>KOÇ</Text>
            <Text style={[styles.cardTitle, completedToday && styles.cardTitleDone]}>
              {goal.title}
            </Text>
          </View>
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
        {atRisk && (
          <Text style={styles.riskHint}>
            ⚠ {goal.streak} günlük serin bugün bitiyor. Gün dolmadan işaretle.
          </Text>
        )}

        {!!schedule && <Text style={styles.cardSchedule}>{schedule}</Text>}

        <View style={styles.cardFooter}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{formatGoalCadence(goal)}</Text>
          </View>
          {!!goal.endDate && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Bitiş {goal.endDate}</Text>
            </View>
          )}
          {isRepeating(goal) && goal.streak > 0 && (
            <View style={styles.badge}>
              <Text style={styles.streakBadgeText}>🔥 {goal.streak} seri</Text>
            </View>
          )}
        </View>
      </View>
    </Swipeable>
  );
}

function slotLabel(goal: Goal): string {
  switch (goal.timeSlot) {
    case 'sabah':
      return 'Sabah';
    case 'ogle':
      return 'Öğle';
    case 'aksam':
      return 'Akşam';
    default:
      return '';
  }
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#050505',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 14,
    gap: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    color: '#F5F5F5',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 1,
  },
  headerMeta: {
    color: '#7A7A7A',
    fontSize: 12,
    fontWeight: '600',
  },
  headerScore: {
    color: '#3DDC84',
    fontSize: 15,
    fontWeight: '800',
    marginTop: 4,
  },
  headerScoreNegative: {
    color: '#FF5C5C',
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonGlyph: {
    fontSize: 16,
  },
  iconButtonBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: '#C1121F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  swipeBanner: {
    marginHorizontal: 20,
    marginBottom: 10,
    backgroundColor: '#1C1C1E',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  swipeHint: {
    color: '#A1A1A6',
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 16,
  },
  waterSetup: {
    marginHorizontal: 20,
    marginBottom: 14,
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: '#242424',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 3,
  },
  waterSetupTitle: {
    color: '#E4E4E4',
    fontSize: 13,
    fontWeight: '700',
  },
  waterSetupHint: {
    color: '#6B6B6B',
    fontSize: 12,
  },
  waterCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 14,
  },
  waterMain: {
    flex: 1,
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: '#242424',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 8,
  },
  waterTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  waterTitle: {
    color: '#6B6B6B',
    fontSize: 11,
    fontWeight: '700',
  },
  waterRemaining: {
    color: '#E4E4E4',
    fontSize: 13,
    fontWeight: '800',
  },
  waterRemainingDone: {
    color: '#3DDC84',
  },
  waterTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: '#1F1F1F',
    overflow: 'hidden',
  },
  waterFill: {
    height: '100%',
    backgroundColor: '#3E7CB1',
  },
  waterDrinkButton: {
    width: 64,
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: '#2F5D7C',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waterDrinkValue: {
    color: '#9FC4E0',
    fontSize: 14,
    fontWeight: '800',
  },
  rankOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  rankBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.62)',
  },
  rankSheet: {
    backgroundColor: '#0B0B0B',
    borderTopWidth: 1,
    borderColor: '#2A2A2A',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 28,
    maxHeight: '82%',
    gap: 12,
  },
  rankSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rankSheetTitle: {
    color: '#F2F2F2',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  rankClose: {
    color: '#B5B5B5',
    fontSize: 20,
    fontWeight: '600',
    paddingHorizontal: 6,
  },
  rankList: {
    flexGrow: 0,
  },
  rankListContent: {
    gap: 8,
    paddingBottom: 4,
  },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rankRowCurrent: {
    borderColor: '#3DDC84',
    backgroundColor: '#102016',
  },
  rankRowCopy: {
    flex: 1,
    gap: 2,
  },
  rankRowName: {
    color: '#E8E8E8',
    fontSize: 15,
    fontWeight: '800',
  },
  rankRowNameCurrent: {
    color: '#3DDC84',
  },
  rankRowRange: {
    color: '#8A8A8A',
    fontSize: 12,
    fontWeight: '600',
  },
  rankRowRangeCurrent: {
    color: '#8FCBAA',
  },
  rankHere: {
    color: '#3DDC84',
    fontSize: 11,
    fontWeight: '800',
  },
  rankDismiss: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 14,
  },
  rankDismissLabel: {
    color: '#E4E4E4',
    fontSize: 14,
    fontWeight: '800',
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
    borderLeftWidth: 3,
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
    paddingBottom: 32,
    gap: 12,
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
  emptyButton: {
    marginTop: 8,
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 10,
    paddingHorizontal: 22,
    paddingVertical: 14,
  },
  emptyButtonLabel: {
    color: '#E4E4E4',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
  },
  card: {
    backgroundColor: '#151515',
    borderWidth: 1,
    borderColor: '#262626',
    borderLeftWidth: 3,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
  },
  reminderCard: {
    borderLeftColor: GOAL_TYPE_COLORS.reminder,
  },
  coachCard: {
    borderLeftColor: GOAL_TYPE_COLORS.coach,
  },
  cardBodyHit: {
    gap: 6,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardTitleBlock: {
    flex: 1,
    gap: 3,
  },
  reminderKicker: {
    color: GOAL_TYPE_COLORS.reminder,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  coachKicker: {
    color: GOAL_TYPE_COLORS.coach,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  cardTitle: {
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
  riskHint: {
    color: '#D98C2B',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  cardDescription: {
    color: '#9A9A9A',
    fontSize: 14,
    lineHeight: 20,
  },
  cardSchedule: {
    color: '#7A7A7A',
    fontSize: 12,
    fontWeight: '600',
  },
  cardFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
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
  reminderCompleteButton: {
    marginTop: 2,
    backgroundColor: '#1A3344',
    borderWidth: 1,
    borderColor: '#2F5D7C',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  reminderCompleteLabel: {
    color: '#9FC4E0',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  reminderDoneHint: {
    color: '#3DDC84',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
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
});
