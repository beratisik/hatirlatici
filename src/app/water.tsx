import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
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

import { padDatePart, useWater } from '@/context/GoalContext';
import { WheelPicker } from '@/components/wheel-picker';
import {
  buildWaterSlots,
  calculateDailyWaterMl,
  DEFAULT_INTERVAL_MINUTES,
  DEFAULT_WAKE_TIME,
  formatLiters,
  HEIGHT_RANGE,
  nextSlotAfter,
  parseClockTime,
  perSlotMl,
  WATER_INTERVAL_OPTIONS,
  WATER_ML_OPTIONS,
  waterCoachLine,
  WEIGHT_RANGE,
} from '@/lib/water';

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => padDatePart(i));
const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, i) => padDatePart(i * 5));

export default function WaterScreen() {
  const router = useRouter();
  const { water, saveWaterSettings, logWater, undoLastWater, clearWaterPlan } = useWater();

  const [editing, setEditing] = useState(!water.settings);
  const [height, setHeight] = useState(water.settings ? String(water.settings.heightCm) : '');
  const [weight, setWeight] = useState(water.settings ? String(water.settings.weightKg) : '');
  const [wakeTime, setWakeTime] = useState(water.settings?.wakeTime ?? DEFAULT_WAKE_TIME);
  const [intervalMinutes, setIntervalMinutes] = useState(
    water.settings?.intervalMinutes ?? DEFAULT_INTERVAL_MINUTES,
  );
  const [timeModalVisible, setTimeModalVisible] = useState(false);
  const [draftHourIndex, setDraftHourIndex] = useState(0);
  const [draftMinuteIndex, setDraftMinuteIndex] = useState(0);

  const heightCm = Number(height);
  const weightKg = Number(weight);
  const heightValid =
    Number.isFinite(heightCm) && heightCm >= HEIGHT_RANGE.min && heightCm <= HEIGHT_RANGE.max;
  const weightValid =
    Number.isFinite(weightKg) && weightKg >= WEIGHT_RANGE.min && weightKg <= WEIGHT_RANGE.max;
  const formValid = heightValid && weightValid;

  const preview = useMemo(() => {
    if (!formValid) return null;
    const targetMl = calculateDailyWaterMl(heightCm, weightKg);
    const slots = buildWaterSlots(wakeTime, intervalMinutes);
    return { targetMl, slots, sipMl: perSlotMl(targetMl, slots.length) };
  }, [formValid, heightCm, weightKg, wakeTime, intervalMinutes]);

  const nextSlot = useMemo(() => nextSlotAfter(water.slots, new Date()), [water.slots]);

  function handleOpenTimeModal() {
    const parsed = parseClockTime(wakeTime) ?? { hour: 8, minute: 0 };
    setDraftHourIndex(parsed.hour);
    setDraftMinuteIndex(Math.round(parsed.minute / 5) % MINUTE_OPTIONS.length);
    setTimeModalVisible(true);
  }

  function handleConfirmTime() {
    setWakeTime(`${HOUR_OPTIONS[draftHourIndex]}:${MINUTE_OPTIONS[draftMinuteIndex]}`);
    setTimeModalVisible(false);
  }

  function handleSavePlan() {
    if (!formValid) return;
    saveWaterSettings({ heightCm, weightKg, wakeTime, intervalMinutes });
    setEditing(false);
  }

  function handleDeletePlan() {
    clearWaterPlan();
    setHeight('');
    setWeight('');
    setWakeTime(DEFAULT_WAKE_TIME);
    setIntervalMinutes(DEFAULT_INTERVAL_MINUTES);
    setEditing(true);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backHit} activeOpacity={0.7} onPress={() => router.back()}>
          <Text style={styles.backText}>‹ Geri</Text>
        </TouchableOpacity>
        <Text style={styles.title}>SU TAKİBİ</Text>
        <Text style={styles.subtitle}>
          {editing
            ? 'Boyunu ve kilonu gir. Günlük hedefini koç belirler.'
            : 'Uyarı geldiğinde içtiğin miktarı işaretle. İşaretlemezsen düşmez.'}
        </Text>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {editing ? (
            <View style={styles.section}>
              <Text style={styles.label}>Boyun (cm)</Text>
              <TextInput
                style={[styles.input, height.length > 0 && !heightValid && styles.inputInvalid]}
                value={height}
                onChangeText={setHeight}
                keyboardType="number-pad"
                maxLength={3}
                placeholder="175"
                placeholderTextColor="#5A5A5A"
              />

              <Text style={styles.label}>Kilon (kg)</Text>
              <TextInput
                style={[styles.input, weight.length > 0 && !weightValid && styles.inputInvalid]}
                value={weight}
                onChangeText={setWeight}
                keyboardType="number-pad"
                maxLength={3}
                placeholder="70"
                placeholderTextColor="#5A5A5A"
              />

              <Text style={styles.label}>Sabah kaçta uyanıyorsun?</Text>
              <TouchableOpacity
                style={styles.selectButton}
                activeOpacity={0.85}
                onPress={handleOpenTimeModal}>
                <Text style={styles.selectButtonValue}>{wakeTime}</Text>
                <Text style={styles.selectButtonHint}>İlk uyarı 1 saat sonra gelir</Text>
              </TouchableOpacity>

              <Text style={styles.label}>Ne sıklıkla uyaralım?</Text>
              <View style={styles.options}>
                {WATER_INTERVAL_OPTIONS.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.chip, intervalMinutes === item.minutes && styles.chipSelected]}
                    activeOpacity={0.85}
                    onPress={() => setIntervalMinutes(item.minutes)}>
                    <Text
                      style={[
                        styles.chipLabel,
                        intervalMinutes === item.minutes && styles.chipLabelSelected,
                      ]}>
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {preview && (
                <View style={styles.previewCard}>
                  <Text style={styles.previewTarget}>{formatLiters(preview.targetMl)}</Text>
                  <Text style={styles.previewLabel}>GÜNLÜK HEDEFİN</Text>
                  <Text style={styles.previewLine}>
                    İlk uyarı {preview.slots[0] ?? '—'} · {preview.slots.length} hatırlatma ·
                    uyarı başına {preview.sipMl} ml
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={[styles.primary, !formValid && styles.primaryDisabled]}
                activeOpacity={0.85}
                disabled={!formValid}
                onPress={handleSavePlan}>
                <Text style={styles.primaryLabel}>
                  {water.settings ? 'PLANI GÜNCELLE' : 'PLANI BAŞLAT'}
                </Text>
              </TouchableOpacity>

              {water.settings && (
                <TouchableOpacity
                  style={styles.cancelHit}
                  activeOpacity={0.7}
                  onPress={() => setEditing(false)}>
                  <Text style={styles.cancelText}>Vazgeç</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View style={styles.section}>
              <View style={styles.progressCard}>
                <Text style={styles.remainingValue}>{formatLiters(water.remainingMl)}</Text>
                <Text style={styles.remainingLabel}>BUGÜN KALAN</Text>

                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${water.progress * 100}%` }]} />
                </View>

                <Text style={styles.progressMeta}>
                  {water.consumedMl} / {water.targetMl} ml içildi
                </Text>
                <Text style={styles.coachLine}>
                  {waterCoachLine(water.consumedMl, water.targetMl)}
                </Text>
              </View>

              <Text style={styles.label}>Ne kadar içtin?</Text>
              <View style={styles.options}>
                {WATER_ML_OPTIONS.map((ml) => (
                  <TouchableOpacity
                    key={ml}
                    style={[styles.mlButton, ml === water.sipMl && styles.mlButtonSuggested]}
                    activeOpacity={0.85}
                    onPress={() => logWater(ml)}>
                    <Text style={styles.mlButtonValue}>{ml}</Text>
                    <Text style={styles.mlButtonUnit}>ml</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.hint}>
                Koçun önerisi her uyarıda {water.sipMl} ml. Dokunmazsan hedeften hiçbir şey düşmez.
              </Text>

              <View style={styles.planCard}>
                <View style={styles.planRow}>
                  <Text style={styles.planKey}>Sıradaki uyarı</Text>
                  <Text style={styles.planValue}>{nextSlot ?? '—'}</Text>
                </View>
                <View style={styles.planRow}>
                  <Text style={styles.planKey}>Uyarı saatleri</Text>
                  <Text style={styles.planValue}>{water.slots.join(' · ')}</Text>
                </View>
                <View style={styles.planRow}>
                  <Text style={styles.planKey}>Boy / kilo</Text>
                  <Text style={styles.planValue}>
                    {water.settings?.heightCm} cm · {water.settings?.weightKg} kg
                  </Text>
                </View>
              </View>

              <Text style={styles.label}>Bugünkü kayıtlar</Text>
              {water.entries.length === 0 ? (
                <Text style={styles.hint}>Bugün henüz su içmedin.</Text>
              ) : (
                <View style={styles.logList}>
                  {water.entries
                    .slice()
                    .reverse()
                    .map((entry) => (
                      <View key={entry.id} style={styles.logItem}>
                        <Text style={styles.logTime}>{entry.time}</Text>
                        <Text style={styles.logMl}>{entry.ml} ml</Text>
                      </View>
                    ))}
                </View>
              )}

              {water.entries.length > 0 && (
                <TouchableOpacity
                  style={styles.secondary}
                  activeOpacity={0.85}
                  onPress={undoLastWater}>
                  <Text style={styles.secondaryLabel}>SON KAYDI GERİ AL</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.secondary}
                activeOpacity={0.85}
                onPress={() => setEditing(true)}>
                <Text style={styles.secondaryLabel}>PLANI DÜZENLE</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.cancelHit} activeOpacity={0.7} onPress={handleDeletePlan}>
                <Text style={styles.cancelText}>Planı sil</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={timeModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setTimeModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>UYANIŞ SAATİ</Text>

            <View style={styles.wheelRow}>
              <WheelPicker
                data={HOUR_OPTIONS}
                selectedIndex={draftHourIndex}
                onSelect={setDraftHourIndex}
              />
              <Text style={styles.timeSeparator}>:</Text>
              <WheelPicker
                data={MINUTE_OPTIONS}
                selectedIndex={draftMinuteIndex}
                onSelect={setDraftMinuteIndex}
              />
            </View>

            <TouchableOpacity
              style={styles.confirmButton}
              activeOpacity={0.85}
              onPress={handleConfirmTime}>
              <Text style={styles.confirmButtonLabel}>ONAYLA</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelHit}
              activeOpacity={0.7}
              onPress={() => setTimeModalVisible(false)}>
              <Text style={styles.cancelText}>Vazgeç</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#050505',
  },
  flex: {
    flex: 1,
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
  },
  section: {
    gap: 12,
  },
  label: {
    color: '#F2F2F2',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.4,
    marginTop: 8,
  },
  input: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 10,
    color: '#F5F5F5',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 18,
    fontWeight: '700',
  },
  inputInvalid: {
    borderColor: '#C1121F',
  },
  selectButton: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 2,
  },
  selectButtonValue: {
    color: '#F5F5F5',
    fontSize: 20,
    fontWeight: '800',
  },
  selectButtonHint: {
    color: '#7A7A7A',
    fontSize: 12,
  },
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#555555',
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
  previewCard: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#C1121F',
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  previewTarget: {
    color: '#F5F5F5',
    fontSize: 40,
    fontWeight: '900',
  },
  previewLabel: {
    color: '#8A8A8A',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
  },
  previewLine: {
    color: '#C8C8C8',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 6,
  },
  progressCard: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    gap: 6,
  },
  remainingValue: {
    color: '#F5F5F5',
    fontSize: 44,
    fontWeight: '900',
  },
  remainingLabel: {
    color: '#8A8A8A',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
  },
  progressTrack: {
    width: '100%',
    height: 10,
    borderRadius: 5,
    backgroundColor: '#1F1F1F',
    borderWidth: 1,
    borderColor: '#2E2E2E',
    overflow: 'hidden',
    marginTop: 10,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#C1121F',
  },
  progressMeta: {
    color: '#C7C7C7',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 6,
  },
  coachLine: {
    color: '#8A8A8A',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  mlButton: {
    minWidth: 74,
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  mlButtonSuggested: {
    borderColor: '#C1121F',
    backgroundColor: 'rgba(193, 18, 31, 0.12)',
  },
  mlButtonValue: {
    color: '#F5F5F5',
    fontSize: 20,
    fontWeight: '900',
  },
  mlButtonUnit: {
    color: '#8A8A8A',
    fontSize: 11,
    fontWeight: '700',
  },
  hint: {
    color: '#7A7A7A',
    fontSize: 12,
    lineHeight: 18,
  },
  planCard: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    marginTop: 8,
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  planKey: {
    color: '#8A8A8A',
    fontSize: 12,
    fontWeight: '700',
  },
  planValue: {
    flex: 1,
    color: '#E4E4E4',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
  },
  logList: {
    gap: 8,
  },
  logItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  logTime: {
    color: '#8A8A8A',
    fontSize: 13,
    fontWeight: '700',
  },
  logMl: {
    color: '#F5F5F5',
    fontSize: 15,
    fontWeight: '800',
  },
  primary: {
    marginTop: 12,
    backgroundColor: '#C1121F',
    borderRadius: 10,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 1,
  },
  primaryDisabled: {
    backgroundColor: '#5A1218',
  },
  primaryLabel: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 1,
  },
  secondary: {
    marginTop: 8,
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
  },
  secondaryLabel: {
    color: '#F5F5F5',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
  },
  cancelHit: {
    alignSelf: 'center',
    paddingVertical: 12,
  },
  cancelText: {
    color: '#8A8A8A',
    fontSize: 14,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalBox: {
    width: '100%',
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
    alignItems: 'center',
  },
  modalTitle: {
    color: '#F2F2F2',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginBottom: 12,
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
  confirmButton: {
    width: '100%',
    marginTop: 16,
    backgroundColor: '#C1121F',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
  },
  confirmButtonLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 1,
  },
});
