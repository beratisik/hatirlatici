import { useMemo, useState } from 'react';
import {
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

import { useGoals, type PlanCategory, type TimeSlot } from '@/context/GoalContext';
import {
  BOOK_Q1_OPTIONS,
  BOOK_Q2_OPTIONS,
  PLAN_CATEGORIES,
  TIME_SLOTS,
  buildCoachGoal,
  recommendedSlot,
  sessionMinutesForPlan,
} from '@/lib/coach';

type Step = 'category' | 'questions' | 'slot';

export default function CoachPlanScreen() {
  const router = useRouter();
  const { addGoal } = useGoals();

  const [step, setStep] = useState<Step>('category');
  const [category, setCategory] = useState<PlanCategory | null>(null);
  const [booksLast6Months, setBooksLast6Months] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [slot, setSlot] = useState<TimeSlot | null>(null);

  const suggestedSlot = useMemo(() => {
    if (!booksLast6Months || !focusId) return 'ogle' as TimeSlot;
    return recommendedSlot(booksLast6Months, focusId);
  }, [booksLast6Months, focusId]);

  const minutes = category ? sessionMinutesForPlan(category, focusId ?? undefined) : 20;
  const bookQuestionsReady = !!booksLast6Months && !!focusId && reason.trim().length > 0;

  function handleCategory(next: PlanCategory) {
    setCategory(next);
    setSlot(null);
    if (next === 'kitap') {
      setStep('questions');
      return;
    }
    setStep('slot');
  }

  function handleCreate() {
    if (!category) return;
    const chosenSlot = slot ?? (category === 'kitap' ? suggestedSlot : 'sabah');
    addGoal(
      buildCoachGoal({
        category,
        slot: chosenSlot,
        sessionMinutes: minutes,
        coachReason: category === 'kitap' ? reason : '',
      }),
    );
    router.replace('/home');
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backHit} activeOpacity={0.7} onPress={() => router.back()}>
          <Text style={styles.backText}>‹ Geri</Text>
        </TouchableOpacity>
        <Text style={styles.title}>KOÇTAN PLAN AL</Text>
        <Text style={styles.subtitle}>
          {step === 'category' && 'Neyi düzeltmek istiyorsun?'}
          {step === 'questions' && 'Cevapların planı belirler. Yalan söyleme.'}
          {step === 'slot' && 'Saati seç. Sonra yine değiştirebilirsin.'}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {step === 'category' && (
          <View style={styles.grid}>
            {PLAN_CATEGORIES.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.categoryCard}
                activeOpacity={0.85}
                onPress={() => handleCategory(item.id)}>
                <Text style={styles.categoryEmoji}>{item.emoji}</Text>
                <Text style={styles.categoryLabel}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {step === 'questions' && (
          <View style={styles.section}>
            <Text style={styles.question}>Son 6 ayda ne kadar kitap okudun?</Text>
            <View style={styles.options}>
              {BOOK_Q1_OPTIONS.map((item) => (
                <ChoiceChip
                  key={item.id}
                  label={item.label}
                  selected={booksLast6Months === item.id}
                  onPress={() => setBooksLast6Months(item.id)}
                />
              ))}
            </View>

            <Text style={styles.question}>Tek oturuşta, dikkatin dağılmadan kaç dakika okuyabilirsin?</Text>
            <View style={styles.options}>
              {BOOK_Q2_OPTIONS.map((item) => (
                <ChoiceChip
                  key={item.id}
                  label={item.label}
                  selected={focusId === item.id}
                  onPress={() => setFocusId(item.id)}
                />
              ))}
            </View>

            <Text style={styles.question}>Seni bu plana iten asıl sebep nedir?</Text>
            <TextInput
              style={styles.reasonInput}
              value={reason}
              onChangeText={setReason}
              placeholder="Tek cümle. Bahanesiz."
              placeholderTextColor="#6B6B6B"
              multiline
            />

            <TouchableOpacity
              style={[styles.primary, !bookQuestionsReady && styles.primaryDisabled]}
              activeOpacity={0.85}
              disabled={!bookQuestionsReady}
              onPress={() => {
                setSlot(suggestedSlot);
                setStep('slot');
              }}>
              <Text style={styles.primaryLabel}>PLANI GÖR</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 'slot' && category && (
          <View style={styles.section}>
            <Text style={styles.planSummary}>
              {minutes} dakikalık günlük plan. Saatleri sonra düzenleyebilirsin.
            </Text>
            {TIME_SLOTS.map((item) => {
              const selected = (slot ?? suggestedSlot) === item.id;
              const recommended = category === 'kitap' && item.id === suggestedSlot;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.slotCard, selected && styles.slotCardSelected]}
                  activeOpacity={0.85}
                  onPress={() => setSlot(item.id)}>
                  <View style={styles.slotTop}>
                    <Text style={styles.slotLabel}>{item.label}</Text>
                    <Text style={styles.slotTime}>{item.time}</Text>
                  </View>
                  <Text style={styles.slotHint}>{item.hint}</Text>
                  {recommended && <Text style={styles.recommended}>KOÇUN ÖNERİSİ</Text>}
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity style={styles.primary} activeOpacity={0.85} onPress={handleCreate}>
              <Text style={styles.primaryLabel}>PLANI BAŞLAT</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
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
  title: {
    color: '#F2F2F2',
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
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
    letterSpacing: 0.4,
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
  reasonInput: {
    minHeight: 100,
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 10,
    color: '#F5F5F5',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    textAlignVertical: 'top',
  },
  planSummary: {
    color: '#C8C8C8',
    fontSize: 14,
    lineHeight: 20,
  },
  slotCard: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 14,
    padding: 16,
    gap: 6,
  },
  slotCardSelected: {
    borderColor: '#C1121F',
    backgroundColor: 'rgba(193, 18, 31, 0.12)',
  },
  slotTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  slotLabel: {
    color: '#F5F5F5',
    fontSize: 18,
    fontWeight: '800',
  },
  slotTime: {
    color: '#C1121F',
    fontSize: 18,
    fontWeight: '900',
  },
  slotHint: {
    color: '#8A8A8A',
    fontSize: 13,
  },
  recommended: {
    color: '#C1121F',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 4,
  },
  primary: {
    marginTop: 8,
    backgroundColor: '#C1121F',
    borderRadius: 10,
    paddingVertical: 20,
    alignItems: 'center',
  },
  primaryDisabled: {
    opacity: 0.4,
  },
  primaryLabel: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 1,
  },
});
