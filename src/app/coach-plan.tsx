import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';

import { padDatePart, useGoals, type PlanCategory } from '@/context/GoalContext';
import { PLAN_CATEGORIES, categoryLabel } from '@/lib/coach';
import {
  goalsFromCoachPlan,
  requestCoachPlan,
  type CoachAiPlan,
  type CoachIntake,
} from '@/lib/openai-coach';
import { WalkCoachSteps } from '@/components/walk-coach-steps';
import { WheelPicker } from '@/components/wheel-picker';

const SCHEDULES = [
  { id: 'weekday', label: 'Pzt-Cuma Tam Zamanlı', homeBased: false },
  { id: 'intense', label: '6 Gün Yoğun', homeBased: false },
  { id: 'student', label: 'Esnek/Öğrenci', homeBased: true },
  { id: 'remote', label: 'Evden Çalışan', homeBased: true },
] as const;

const FOCUS_WINDOWS = ['Yolda', 'Sabah uyanınca', 'Akşam yemeği sonrası', 'Yatmadan önce'] as const;
const BLOCKERS = ['Akşam yorgunluğu', 'Ekran bağımlılığı', 'Plansızlık'] as const;

const HOURS = Array.from({ length: 24 }, (_, index) => padDatePart(index));
const MINUTES = Array.from({ length: 12 }, (_, index) => padDatePart(index * 5));

type ResourceChoice = 'own' | 'coach';
type ScheduleId = (typeof SCHEDULES)[number]['id'];
type ClockField = 'start' | 'end';

export default function CoachPlanScreen() {
  const router = useRouter();
  const { addGoal } = useGoals();
  const abortRef = useRef<AbortController | null>(null);

  const [selectedCategory, setSelectedCategory] = useState<PlanCategory | null>(null);
  const [wizardStep, setWizardStep] = useState(0);
  const [resourceChoice, setResourceChoice] = useState<ResourceChoice | null>(null);
  const [resourceName, setResourceName] = useState('');
  const [scheduleId, setScheduleId] = useState<ScheduleId | null>(null);
  const [startHour, setStartHour] = useState(8);
  const [startMinute, setStartMinute] = useState(6);
  const [endHour, setEndHour] = useState(18);
  const [endMinute, setEndMinute] = useState(6);
  const [activeClock, setActiveClock] = useState<ClockField>('start');
  const [walkPlace, setWalkPlace] = useState<string | null>(null);
  const [walkFitness, setWalkFitness] = useState<string | null>(null);
  const [focusWindow, setFocusWindow] = useState<string | null>(null);
  const [blocker, setBlocker] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<CoachAiPlan | null>(null);

  const schedule = SCHEDULES.find((item) => item.id === scheduleId) ?? null;
  const homeBased = schedule?.homeBased ?? false;
  const startTime = `${HOURS[startHour]}:${MINUTES[startMinute]}`;
  const endTime = `${HOURS[endHour]}:${MINUTES[endMinute]}`;
  const categoryName = categoryLabel(selectedCategory);
  const isWalk = selectedCategory === 'yuruyus';

  function closeWizard() {
    abortRef.current?.abort();
    setSelectedCategory(null);
    setWizardStep(0);
    setResourceChoice(null);
    setResourceName('');
    setScheduleId(null);
    setWalkPlace(null);
    setWalkFitness(null);
    setFocusWindow(null);
    setBlocker(null);
    setLoading(false);
    setError(null);
    setPlan(null);
  }

  function handleBack() {
    if (plan || loading || error) {
      closeWizard();
      return;
    }
    if (selectedCategory && wizardStep > 0) {
      setWizardStep((step) => step - 1);
      return;
    }
    if (selectedCategory) {
      closeWizard();
      return;
    }
    router.back();
  }

  function canAdvance(): boolean {
    if (wizardStep === 0) {
      if (isWalk) return !!walkPlace;
      if (resourceChoice === 'coach') return true;
      return resourceChoice === 'own' && resourceName.trim().length > 0;
    }
    if (wizardStep === 1) return isWalk ? !!walkFitness : !!scheduleId;
    if (wizardStep === 2) return startTime !== endTime;
    return !!focusWindow && !!blocker;
  }

  function buildIntake(): CoachIntake | null {
    if (!focusWindow || !blocker) return null;
    if (isWalk) {
      if (!walkPlace || !walkFitness) return null;
      return {
        kind: 'walk',
        selectedCategory: categoryName,
        resourceName: null,
        scheduleLabel: '',
        hoursKind: 'commute',
        place: walkPlace,
        fitness: walkFitness,
        startTime,
        endTime,
        focusWindow,
        blocker,
      };
    }
    if (!schedule) return null;
    return {
      kind: 'default',
      selectedCategory: categoryName,
      resourceName: resourceChoice === 'own' ? resourceName.trim() : null,
      scheduleLabel: schedule.label,
      hoursKind: schedule.homeBased ? 'home' : 'commute',
      place: null,
      fitness: null,
      startTime,
      endTime,
      focusWindow,
      blocker,
    };
  }

  async function generatePlan() {
    const intake = buildIntake();
    if (!selectedCategory || !intake) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    setPlan(null);
    try {
      const next = await requestCoachPlan(intake, controller.signal);
      if (!controller.signal.aborted) setPlan(next);
    } catch (caught) {
      if (controller.signal.aborted) return;
      setError(caught instanceof Error ? caught.message : 'Plan hazırlanamadı.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  function handleNext() {
    if (!canAdvance()) return;
    if (wizardStep < 3) {
      setWizardStep((step) => step + 1);
      return;
    }
    void generatePlan();
  }

  function handleAccept() {
    if (!selectedCategory || !plan) return;
    for (const goal of goalsFromCoachPlan(selectedCategory, plan)) {
      addGoal(goal);
    }
    router.replace('/home');
  }

  const wizardOpen = !!selectedCategory;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backHit} activeOpacity={0.7} onPress={handleBack}>
          <Text style={styles.backText}>‹ Geri</Text>
        </TouchableOpacity>
        <Text style={styles.title}>KOÇTAN PLAN AL</Text>
        <Text style={styles.subtitle}>Neyi düzeltmek istiyorsun?</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.grid}>
          {PLAN_CATEGORIES.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.categoryCard}
              activeOpacity={0.85}
              onPress={() => {
                setSelectedCategory(item.id);
                setWizardStep(0);
                setPlan(null);
                setError(null);
              }}>
              <Text style={styles.categoryEmoji}>{item.emoji}</Text>
              <Text style={styles.categoryLabel}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <Modal visible={wizardOpen} animationType="slide" onRequestClose={handleBack}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.backHit} activeOpacity={0.7} onPress={handleBack}>
              <Text style={styles.backText}>‹ Geri</Text>
            </TouchableOpacity>
            <Text style={styles.wizardKicker}>{categoryName}</Text>
            <Text style={styles.title}>
              {plan
                ? 'KOÇUN PLANI'
                : loading
                  ? 'KOÇ DÜŞÜNÜYOR'
                  : isWalk
                    ? `YÜRÜYÜŞ · ${wizardStep + 1}/4`
                    : `ADIM ${wizardStep + 1} / 4`}
            </Text>
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color="#C1121F" />
              <Text style={styles.loadingText}>
                Koç bahanelerini analiz edip programını hazırlıyor...
              </Text>
            </View>
          ) : error ? (
            <View style={styles.loadingBox}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.primary} activeOpacity={0.85} onPress={() => void generatePlan()}>
                <Text style={styles.primaryLabel}>TEKRAR DENE</Text>
              </TouchableOpacity>
            </View>
          ) : plan ? (
            <ScrollView contentContainerStyle={styles.content}>
              <Text style={styles.summary}>{plan.coach_summary}</Text>
              <View style={styles.resourceCard}>
                <Text style={styles.resourceLabel}>{plan.kind === 'walk' ? 'TARZ' : 'KAYNAK'}</Text>
                <Text style={styles.resourceValue}>
                  {plan.kind === 'walk' ? plan.assigned_style : plan.assigned_resource}
                </Text>
              </View>
              {plan.tasks.map((task) => (
                <View key={`${task.scheduled_time}-${task.title}`} style={styles.taskCard}>
                  <View style={styles.slotTop}>
                    <Text style={styles.taskTitle}>{task.title}</Text>
                    <Text style={styles.slotTime}>
                      {task.scheduled_time} · {task.duration_minutes} dk
                    </Text>
                  </View>
                  <Text style={styles.taskNote}>{task.coach_note}</Text>
                </View>
              ))}
              <TouchableOpacity style={styles.primary} activeOpacity={0.85} onPress={handleAccept}>
                <Text style={styles.primaryLabel}>GÖREVİ KABUL ET</Text>
              </TouchableOpacity>
            </ScrollView>
          ) : (
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
              {isWalk ? (
                <WalkCoachSteps
                  step={wizardStep}
                  place={walkPlace}
                  onPlace={setWalkPlace}
                  fitness={walkFitness}
                  onFitness={setWalkFitness}
                  focus={focusWindow}
                  onFocus={setFocusWindow}
                  blocker={blocker}
                  onBlocker={setBlocker}
                  startTime={startTime}
                  endTime={endTime}
                  activeClock={activeClock}
                  onActiveClock={setActiveClock}
                  hours={HOURS}
                  minutes={MINUTES}
                  startHour={startHour}
                  startMinute={startMinute}
                  endHour={endHour}
                  endMinute={endMinute}
                  onStartHour={setStartHour}
                  onStartMinute={setStartMinute}
                  onEndHour={setEndHour}
                  onEndMinute={setEndMinute}
                />
              ) : null}

              {wizardStep === 0 && !isWalk && (
                <View style={styles.section}>
                  <Text style={styles.question}>
                    {categoryName} için elinde belirli bir kaynak/kitap var mı, yoksa koç sana uygun bir
                    tane mi atasın?
                  </Text>
                  <View style={styles.options}>
                    <ChoiceChip
                      label="Var"
                      selected={resourceChoice === 'own'}
                      onPress={() => setResourceChoice('own')}
                    />
                    <ChoiceChip
                      label="Koç atasın"
                      selected={resourceChoice === 'coach'}
                      onPress={() => setResourceChoice('coach')}
                    />
                  </View>
                  {resourceChoice === 'own' && (
                    <TextInput
                      value={resourceName}
                      onChangeText={setResourceName}
                      placeholder="Kaynağın adı"
                      placeholderTextColor="#6B6B6B"
                      style={styles.input}
                    />
                  )}
                </View>
              )}

              {wizardStep === 1 && !isWalk && (
                <View style={styles.section}>
                  <Text style={styles.question}>Haftalık tempon nasıl?</Text>
                  <View style={styles.options}>
                    {SCHEDULES.map((item) => (
                      <ChoiceChip
                        key={item.id}
                        label={item.label}
                        selected={scheduleId === item.id}
                        onPress={() => setScheduleId(item.id)}
                      />
                    ))}
                  </View>
                </View>
              )}

              {wizardStep === 2 && !isWalk && (
                <View style={styles.section}>
                  <Text style={styles.question}>
                    {homeBased
                      ? 'Genel uyanış ve uyku saatlerin?'
                      : 'Sabah evden kaçta çıkıyor, akşam kaçta kapıdan giriyorsun?'}
                  </Text>
                  <View style={styles.clockRow}>
                    <ClockButton
                      label={homeBased ? 'Uyanış' : 'Evden çıkış'}
                      value={startTime}
                      active={activeClock === 'start'}
                      onPress={() => setActiveClock('start')}
                    />
                    <ClockButton
                      label={homeBased ? 'Uyku' : 'Kapıdan giriş'}
                      value={endTime}
                      active={activeClock === 'end'}
                      onPress={() => setActiveClock('end')}
                    />
                  </View>
                  <View style={styles.wheelRow}>
                    <WheelPicker
                      key={`${activeClock}-hour`}
                      data={HOURS}
                      selectedIndex={activeClock === 'start' ? startHour : endHour}
                      onSelect={activeClock === 'start' ? setStartHour : setEndHour}
                    />
                    <Text style={styles.timeSeparator}>:</Text>
                    <WheelPicker
                      key={`${activeClock}-minute`}
                      data={MINUTES}
                      selectedIndex={activeClock === 'start' ? startMinute : endMinute}
                      onSelect={activeClock === 'start' ? setStartMinute : setEndMinute}
                    />
                  </View>
                </View>
              )}

              {wizardStep === 3 && !isWalk && (
                <View style={styles.section}>
                  <Text style={styles.question}>Sana kalan en net vakit hangisi?</Text>
                  <View style={styles.options}>
                    {FOCUS_WINDOWS.map((item) => (
                      <ChoiceChip
                        key={item}
                        label={item}
                        selected={focusWindow === item}
                        onPress={() => setFocusWindow(item)}
                      />
                    ))}
                  </View>
                  <Text style={styles.question}>Seni en çok ne baltalıyor?</Text>
                  <View style={styles.options}>
                    {BLOCKERS.map((item) => (
                      <ChoiceChip
                        key={item}
                        label={item}
                        selected={blocker === item}
                        onPress={() => setBlocker(item)}
                      />
                    ))}
                  </View>
                </View>
              )}

              <TouchableOpacity
                style={[styles.primary, !canAdvance() && styles.primaryDisabled]}
                activeOpacity={0.85}
                disabled={!canAdvance()}
                onPress={handleNext}>
                <Text style={styles.primaryLabel}>{wizardStep === 3 ? 'PLANI HAZIRLA' : 'DEVAM'}</Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function ChoiceChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.chip, selected && styles.chipSelected]}
      activeOpacity={0.85}
      onPress={onPress}>
      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

function ClockButton({
  label,
  value,
  active,
  onPress,
}: {
  label: string;
  value: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.clockButton, active && styles.clockButtonActive]}
      activeOpacity={0.85}
      onPress={onPress}>
      <Text style={styles.clockLabel}>{label}</Text>
      <Text style={styles.clockValue}>{value}</Text>
    </TouchableOpacity>
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
    paddingBottom: 8,
    gap: 8,
  },
  backHit: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingRight: 12,
  },
  backText: {
    color: '#B5B5B5',
    fontSize: 16,
    fontWeight: '600',
  },
  wizardKicker: {
    color: '#C1121F',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  title: {
    color: '#F2F2F2',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  subtitle: {
    color: '#8A8A8A',
    fontSize: 14,
    lineHeight: 20,
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    gap: 14,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  categoryCard: {
    width: '47%',
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 10,
    paddingVertical: 22,
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 8,
  },
  categoryEmoji: {
    fontSize: 28,
  },
  categoryLabel: {
    color: '#F5F5F5',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  section: {
    gap: 14,
  },
  question: {
    color: '#F2F2F2',
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 22,
    marginTop: 6,
  },
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  chipSelected: {
    borderColor: '#C1121F',
    backgroundColor: 'rgba(193, 18, 31, 0.12)',
  },
  chipLabel: {
    color: '#C8C8C8',
    fontSize: 13,
    fontWeight: '700',
  },
  chipLabelSelected: {
    color: '#FFFFFF',
  },
  input: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 10,
    color: '#F5F5F5',
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  clockRow: {
    flexDirection: 'row',
    gap: 10,
  },
  clockButton: {
    flex: 1,
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 4,
  },
  clockButtonActive: {
    borderColor: '#C1121F',
  },
  clockLabel: {
    color: '#8A8A8A',
    fontSize: 11,
    fontWeight: '700',
  },
  clockValue: {
    color: '#F5F5F5',
    fontSize: 18,
    fontWeight: '800',
  },
  wheelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  timeSeparator: {
    color: '#8A8A8A',
    fontSize: 24,
    fontWeight: '700',
  },
  primary: {
    marginTop: 8,
    backgroundColor: '#C1121F',
    borderRadius: 10,
    paddingVertical: 18,
    alignItems: 'center',
  },
  primaryDisabled: {
    opacity: 0.4,
  },
  primaryLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
  },
  loadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  loadingText: {
    color: '#E4E4E4',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 22,
  },
  errorText: {
    color: '#FF5C5C',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 22,
  },
  summary: {
    color: '#F2F2F2',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 24,
  },
  resourceCard: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 12,
    padding: 14,
    gap: 4,
  },
  resourceLabel: {
    color: '#8A8A8A',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  resourceValue: {
    color: '#F5F5F5',
    fontSize: 16,
    fontWeight: '800',
  },
  taskCard: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderLeftWidth: 3,
    borderLeftColor: '#C1121F',
    borderRadius: 12,
    padding: 14,
    gap: 6,
  },
  slotTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  taskTitle: {
    flex: 1,
    color: '#F5F5F5',
    fontSize: 15,
    fontWeight: '800',
  },
  slotTime: {
    color: '#C1121F',
    fontSize: 12,
    fontWeight: '800',
  },
  taskNote: {
    color: '#9A9A9A',
    fontSize: 13,
    lineHeight: 18,
  },
});
