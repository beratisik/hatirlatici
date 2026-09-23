import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
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
import { useLocalSearchParams, useRouter } from 'expo-router';

import {
  EDIT_LOCK_MESSAGE,
  formatRepeatSummary,
  isTimeEditLocked,
  padDatePart,
  parseGoalDateParts,
  parseGoalTime,
  useGoals,
  type RepeatConfig,
  type RepeatUnit,
} from '@/context/GoalContext';
import { WHEEL_CONTAINER_HEIGHT, WheelPicker } from '@/components/wheel-picker';

// ---------------------------------------------------------------------------
// "Anımsatıcı" ekranı — tarih için gerçek bir takvim, saat için iOS tarzı
// çekmeli (wheel) seçici, tekrar için birim + sayı seçici içerir.
// Bu modülün dili tarafsızdır; koç tavrı yalnızca koç hedeflerine aittir.
// ---------------------------------------------------------------------------

const MONTH_NAMES = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];
const WEEKDAY_LABELS = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'];

const UNIT_OPTIONS: { value: RepeatUnit; label: string }[] = [
  { value: 'saat', label: 'Saat' },
  { value: 'gun', label: 'Gün' },
  { value: 'hafta', label: 'Hafta' },
  { value: 'ay', label: 'Ay' },
];
const NUMBER_OPTIONS = Array.from({ length: 10 }, (_, i) => String(i + 1));
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => pad(i));
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, i) => pad(i));

function pad(value: number) {
  return padDatePart(value);
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getMondayFirstWeekday(year: number, month: number) {
  const jsDay = new Date(year, month, 1).getDay(); // 0 = Pazar
  return (jsDay + 6) % 7; // 0 = Pazartesi
}

export default function NewGoalScreen() {
  const router = useRouter();
  const { addGoal, updateGoal, goals } = useGoals();
  const { profile, id } = useLocalSearchParams<{ profile?: string; id?: string }>();
  const editingGoal = id ? goals.find((goal) => goal.id === id) : undefined;
  const isEditing = !!editingGoal;
  const isCoachEdit = editingGoal?.type === 'coach';
  // Son saat kilidi koç modülüne ait bir yaptırım; anımsatıcılar serbestçe düzenlenir.
  const timeLocked = Boolean(editingGoal && isCoachEdit && isTimeEditLocked(editingGoal));

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  // --- Tarih (takvim) state ---
  const now = new Date();
  const nowHour = now.getHours();
  const nowMinute = now.getMinutes();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [dateModalVisible, setDateModalVisible] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(today.getMonth());
  const [calendarYear, setCalendarYear] = useState(today.getFullYear());
  const [selectedDate, setSelectedDate] = useState<{ day: number; month: number; year: number } | null>(
    null,
  );
  const [selectedEndDate, setSelectedEndDate] = useState<{
    day: number;
    month: number;
    year: number;
  } | null>(null);
  const [calendarTarget, setCalendarTarget] = useState<'start' | 'end'>('start');

  // --- Saat (wheel) state ---
  const [timeModalVisible, setTimeModalVisible] = useState(false);
  const [draftHourIndex, setDraftHourIndex] = useState(9);
  const [draftMinuteIndex, setDraftMinuteIndex] = useState(0);
  const [selectedTime, setSelectedTime] = useState<{ hour: number; minute: number } | null>(null);

  // --- Tekrar (birim + sayı) state ---
  const [repeatModalVisible, setRepeatModalVisible] = useState(false);
  const [draftUnit, setDraftUnit] = useState<RepeatUnit>('saat');
  const [draftIntervalIndex, setDraftIntervalIndex] = useState(0);
  const [repeatConfig, setRepeatConfig] = useState<RepeatConfig | null>(null);
  const hydratedEdit = useRef(false);

  useEffect(() => {
    if (!editingGoal || hydratedEdit.current) return;
    hydratedEdit.current = true;
    setTitle(editingGoal.title);
    setDescription(editingGoal.description);
    const start = parseGoalDateParts(editingGoal.date);
    if (start) setSelectedDate(start);
    const end = parseGoalDateParts(editingGoal.endDate);
    if (end) setSelectedEndDate(end);
    const clock = parseGoalTime(editingGoal.time);
    if (clock) setSelectedTime(clock);
    setRepeatConfig(editingGoal.repeat);
  }, [editingGoal]);

  function handleGoBack() {
    router.back();
  }

  // --- Takvim yardımcıları ---
  function endDateMin() {
    if (selectedDate) {
      const min = new Date(selectedDate.year, selectedDate.month - 1, selectedDate.day);
      min.setHours(0, 0, 0, 0);
      return min;
    }
    return today;
  }

  function isDisabledDay(day: number) {
    const candidate = new Date(calendarYear, calendarMonth, day);
    candidate.setHours(0, 0, 0, 0);
    if (calendarTarget === 'end') {
      return candidate.getTime() < endDateMin().getTime();
    }
    return candidate.getTime() < today.getTime();
  }

  function isDateToday(d: { day: number; month: number; year: number } | null) {
    // Tarih henüz seçilmediyse "bugün" varsayılır (saat kısıtı yine uygulanır).
    if (!d) return true;
    return d.day === now.getDate() && d.month === now.getMonth() + 1 && d.year === now.getFullYear();
  }

  const restrictTimeToNow = !isEditing && isDateToday(selectedDate);

  function isSelectedDay(day: number) {
    const current = calendarTarget === 'end' ? selectedEndDate : selectedDate;
    return (
      !!current &&
      current.day === day &&
      current.month === calendarMonth + 1 &&
      current.year === calendarYear
    );
  }

  const minForNav = calendarTarget === 'end' ? endDateMin() : today;
  const isPrevMonthDisabled =
    calendarYear === minForNav.getFullYear() && calendarMonth === minForNav.getMonth();

  function handleOpenDateModal() {
    setCalendarTarget('start');
    setCalendarMonth(selectedDate ? selectedDate.month - 1 : today.getMonth());
    setCalendarYear(selectedDate ? selectedDate.year : today.getFullYear());
    setDateModalVisible(true);
  }

  function handleOpenEndDateModal() {
    const min = endDateMin();
    setCalendarTarget('end');
    setCalendarMonth(selectedEndDate ? selectedEndDate.month - 1 : min.getMonth());
    setCalendarYear(selectedEndDate ? selectedEndDate.year : min.getFullYear());
    setDateModalVisible(true);
  }

  function handlePrevMonth() {
    if (isPrevMonthDisabled) return;
    if (calendarMonth === 0) {
      setCalendarMonth(11);
      setCalendarYear(calendarYear - 1);
    } else {
      setCalendarMonth(calendarMonth - 1);
    }
  }

  function handleNextMonth() {
    if (calendarMonth === 11) {
      setCalendarMonth(0);
      setCalendarYear(calendarYear + 1);
    } else {
      setCalendarMonth(calendarMonth + 1);
    }
  }

  function handleSelectDay(day: number) {
    if (isDisabledDay(day)) return;
    const nextDate = { day, month: calendarMonth + 1, year: calendarYear };

    if (calendarTarget === 'end') {
      setSelectedEndDate(nextDate);
      setDateModalVisible(false);
      return;
    }

    setSelectedDate(nextDate);
    setDateModalVisible(false);

    if (selectedEndDate) {
      const start = new Date(nextDate.year, nextDate.month - 1, nextDate.day).getTime();
      const end = new Date(selectedEndDate.year, selectedEndDate.month - 1, selectedEndDate.day).getTime();
      if (end < start) setSelectedEndDate(null);
    }

    // Seçilen gün bugünse ve önceden seçilmiş saat artık geçmişte kaldıysa, "şimdi"ye kenetle.
    if (isDateToday(nextDate) && selectedTime) {
      const isPast =
        selectedTime.hour < nowHour || (selectedTime.hour === nowHour && selectedTime.minute < nowMinute);
      if (isPast) {
        setSelectedTime({ hour: nowHour, minute: nowMinute });
      }
    }
  }

  // --- Saat yardımcıları ---
  const disabledHourIndexes = useMemo(() => {
    if (!restrictTimeToNow) return undefined;
    const set = new Set<number>();
    for (let h = 0; h < nowHour; h++) set.add(h);
    return set;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restrictTimeToNow, nowHour]);

  const disabledMinuteIndexes = useMemo(() => {
    if (!restrictTimeToNow) return undefined;
    if (draftHourIndex > nowHour) return undefined; // seçili saat şu andan ileriyse dakika kısıtı yok
    if (draftHourIndex < nowHour) {
      // Emniyet için: bu saat zaten geçersiz olmalı, tüm dakikaları kapat.
      return new Set(MINUTE_OPTIONS.map((_, i) => i));
    }
    const set = new Set<number>();
    for (let m = 0; m < nowMinute; m++) set.add(m);
    return set;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restrictTimeToNow, draftHourIndex, nowHour, nowMinute]);

  function handleOpenTimeModal() {
    if (timeLocked) {
      Alert.alert('SERT KOÇ', EDIT_LOCK_MESSAGE);
      return;
    }
    let hour = selectedTime ? selectedTime.hour : restrictTimeToNow ? nowHour : 9;
    let minute = selectedTime ? selectedTime.minute : restrictTimeToNow ? nowMinute : 0;
    if (restrictTimeToNow && (hour < nowHour || (hour === nowHour && minute < nowMinute))) {
      hour = nowHour;
      minute = nowMinute;
    }
    setDraftHourIndex(hour);
    setDraftMinuteIndex(minute);
    setTimeModalVisible(true);
  }

  function handleConfirmTime() {
    let hour = draftHourIndex;
    let minute = draftMinuteIndex;
    if (restrictTimeToNow && (hour < nowHour || (hour === nowHour && minute < nowMinute))) {
      hour = nowHour;
      minute = nowMinute;
    }
    setSelectedTime({ hour, minute });
    setTimeModalVisible(false);
  }

  // --- Tekrar yardımcıları ---
  function handleOpenRepeatModal() {
    setDraftUnit(repeatConfig?.unit ?? 'saat');
    setDraftIntervalIndex((repeatConfig?.interval ?? 1) - 1);
    setRepeatModalVisible(true);
  }

  function handleConfirmRepeat() {
    setRepeatConfig({ unit: draftUnit, interval: draftIntervalIndex + 1 });
    setRepeatModalVisible(false);
  }

  function handleClearRepeat() {
    setRepeatConfig(null);
    setSelectedEndDate(null);
    setRepeatModalVisible(false);
  }

  function handleSave() {
    if (!title.trim()) {
      Alert.alert('Eksik bilgi', 'Bir başlık girmelisin.');
      return;
    }

    const timeValue = selectedTime ? `${pad(selectedTime.hour)}:${pad(selectedTime.minute)}` : '';
    const endValue =
      (isEditing ? editingGoal?.repeat : repeatConfig) && selectedEndDate
        ? `${pad(selectedEndDate.day)}.${pad(selectedEndDate.month)}.${selectedEndDate.year}`
        : '';

    if (isEditing && editingGoal) {
      if (timeLocked && timeValue !== editingGoal.time) {
        Alert.alert('SERT KOÇ', EDIT_LOCK_MESSAGE);
        return;
      }
      updateGoal(editingGoal.id, {
        title: title.trim(),
        time: timeLocked ? editingGoal.time : timeValue,
        endDate: editingGoal.repeat ? endValue : editingGoal.endDate,
      });
      router.back();
      return;
    }

    addGoal({
      type: 'reminder',
      title: title.trim(),
      description: description.trim(),
      date: selectedDate
        ? `${pad(selectedDate.day)}.${pad(selectedDate.month)}.${selectedDate.year}`
        : '',
      time: timeValue,
      repeat: repeatConfig,
      endDate: endValue,
    });

    router.replace({ pathname: '/home', params: { profile: profile ?? '' } });
  }

  const dateButtonLabel = selectedDate
    ? `${pad(selectedDate.day)}/${pad(selectedDate.month)}/${selectedDate.year}`
    : '📅 Tarih Seç';
  const endDateButtonLabel = selectedEndDate
    ? `${pad(selectedEndDate.day)}/${pad(selectedEndDate.month)}/${selectedEndDate.year}`
    : '📅 Bitiş Tarihi (opsiyonel)';
  const timeButtonLabel = selectedTime
    ? `${pad(selectedTime.hour)}:${pad(selectedTime.minute)}`
    : '🕒 Saat Seç';

  const daysInMonth = getDaysInMonth(calendarYear, calendarMonth);
  const leadingBlanks = getMondayFirstWeekday(calendarYear, calendarMonth);
  const calendarCells: (number | null)[] = [
    ...Array(leadingBlanks).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled">
          <TouchableOpacity style={styles.backHit} activeOpacity={0.7} onPress={handleGoBack}>
            <Text style={styles.backText}>‹ Geri</Text>
          </TouchableOpacity>

          <Text style={styles.title}>
            {isEditing ? (isCoachEdit ? 'HEDEFİ DÜZENLE' : 'ANIMSATICIYI DÜZENLE') : 'YENİ ANIMSATICI'}
          </Text>

          <View style={styles.form}>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Başlık"
              placeholderTextColor="#6B6B6B"
              style={styles.input}
            />
            {!isEditing && (
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Not (opsiyonel)"
                placeholderTextColor="#6B6B6B"
                style={[styles.input, styles.textArea]}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>ZAMANLAMA</Text>
            <View style={styles.row}>
              {!isEditing && (
                <TouchableOpacity
                  style={[styles.timingButton, styles.rowItem, selectedDate && styles.timingButtonActive]}
                  activeOpacity={0.75}
                  onPress={handleOpenDateModal}>
                  <Text style={styles.timingButtonLabel}>{dateButtonLabel}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[
                  styles.timingButton,
                  !isEditing && styles.rowItem,
                  selectedTime && styles.timingButtonActive,
                  timeLocked && styles.timingButtonLocked,
                ]}
                activeOpacity={0.75}
                onPress={handleOpenTimeModal}>
                <Text style={styles.timingButtonLabel}>{timeButtonLabel}</Text>
              </TouchableOpacity>
            </View>
            {timeLocked ? (
              <Text style={styles.warningText}>{EDIT_LOCK_MESSAGE}</Text>
            ) : !isEditing ? (
              <Text style={styles.warningText}>
                ⚠ Bugünü seçebilirsin, ama geçmiş bir günü ya da bugünün geçmiş bir saatini seçemezsin.
              </Text>
            ) : null}
          </View>

          {!isEditing && (
            <View style={styles.section}>
              <TouchableOpacity
                style={styles.repeatButton}
                activeOpacity={0.8}
                onPress={handleOpenRepeatModal}>
                <Text style={styles.repeatButtonLabel}>TEKRAR AYARLARI</Text>
              </TouchableOpacity>
              {!!repeatConfig && (
                <>
                  <Text style={styles.repeatSummary}>{formatRepeatSummary(repeatConfig)}</Text>
                  <TouchableOpacity
                    style={[styles.timingButton, selectedEndDate && styles.timingButtonActive]}
                    activeOpacity={0.75}
                    onPress={handleOpenEndDateModal}>
                    <Text style={styles.timingButtonLabel}>{endDateButtonLabel}</Text>
                  </TouchableOpacity>
                  {!!selectedEndDate && (
                    <TouchableOpacity
                      style={styles.clearEndHit}
                      activeOpacity={0.7}
                      onPress={() => setSelectedEndDate(null)}>
                      <Text style={styles.clearEndText}>Bitiş tarihini kaldır</Text>
                    </TouchableOpacity>
                  )}
                  <Text style={styles.warningText}>
                    Bitiş tarihi geçen tekrarlı görevler otomatik arşive düşer.
                  </Text>
                </>
              )}
            </View>
          )}

          {isEditing && editingGoal?.repeat && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>BİTİŞ TARİHİ</Text>
              <TouchableOpacity
                style={[styles.timingButton, selectedEndDate && styles.timingButtonActive]}
                activeOpacity={0.75}
                onPress={handleOpenEndDateModal}>
                <Text style={styles.timingButtonLabel}>{endDateButtonLabel}</Text>
              </TouchableOpacity>
              {!!selectedEndDate && (
                <TouchableOpacity
                  style={styles.clearEndHit}
                  activeOpacity={0.7}
                  onPress={() => setSelectedEndDate(null)}>
                  <Text style={styles.clearEndText}>Bitiş tarihini kaldır</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity style={styles.saveButton} activeOpacity={0.85} onPress={handleSave}>
            <Text style={styles.saveButtonLabel}>
              {isEditing ? 'DEĞİŞİKLİKLERİ KAYDET' : 'KAYDET'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Tarih Modalı — gerçek takvim */}
      <Modal
        visible={dateModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDateModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>
              {calendarTarget === 'end' ? 'BİTİŞ TARİHİ' : 'TARİH SEÇ'}
            </Text>

            <View style={styles.calendarHeader}>
              <TouchableOpacity
                onPress={handlePrevMonth}
                disabled={isPrevMonthDisabled}
                style={styles.calendarNavButton}>
                <Text style={[styles.calendarNavText, isPrevMonthDisabled && styles.calendarNavTextDisabled]}>
                  ‹
                </Text>
              </TouchableOpacity>
              <Text style={styles.calendarMonthLabel}>
                {MONTH_NAMES[calendarMonth]} {calendarYear}
              </Text>
              <TouchableOpacity onPress={handleNextMonth} style={styles.calendarNavButton}>
                <Text style={styles.calendarNavText}>›</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.calendarWeekRow}>
              {WEEKDAY_LABELS.map((label) => (
                <View key={label} style={styles.calendarWeekCell}>
                  <Text style={styles.calendarWeekText}>{label}</Text>
                </View>
              ))}
            </View>

            <View style={styles.calendarGrid}>
              {calendarCells.map((day, idx) => {
                if (day === null) {
                  return <View key={`blank-${idx}`} style={styles.calendarCell} />;
                }
                const disabled = isDisabledDay(day);
                const selected = isSelectedDay(day);
                return (
                  <TouchableOpacity
                    key={day}
                    style={[styles.calendarCell, selected && styles.calendarCellSelected]}
                    disabled={disabled}
                    activeOpacity={0.7}
                    onPress={() => handleSelectDay(day)}>
                    <Text
                      style={[
                        styles.calendarDayText,
                        disabled && styles.calendarDayTextDisabled,
                        selected && styles.calendarDayTextSelected,
                      ]}>
                      {day}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={styles.cancelHit}
              activeOpacity={0.7}
              onPress={() => setDateModalVisible(false)}>
              <Text style={styles.cancelText}>Vazgeç</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Saat Modalı — iOS tarzı çekmeli (wheel) seçici */}
      <Modal
        visible={timeModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setTimeModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>SAAT SEÇ</Text>

            <View style={styles.wheelRow}>
              <WheelPicker
                data={HOUR_OPTIONS}
                selectedIndex={draftHourIndex}
                onSelect={setDraftHourIndex}
                disabledIndexes={disabledHourIndexes}
              />
              <Text style={styles.timeSeparator}>:</Text>
              <WheelPicker
                data={MINUTE_OPTIONS}
                selectedIndex={draftMinuteIndex}
                onSelect={setDraftMinuteIndex}
                disabledIndexes={disabledMinuteIndexes}
              />
            </View>
            {restrictTimeToNow && (
              <Text style={styles.warningTextCentered}>
                ⚠ Bugün için sadece şu andan sonraki saatler seçilebilir.
              </Text>
            )}

            <TouchableOpacity style={styles.confirmButton} activeOpacity={0.85} onPress={handleConfirmTime}>
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

      {/* Tekrar Ayarları Modalı — birim (Saat/Gün/Hafta/Ay) + 1-10 sayı çarkı */}
      <Modal
        visible={repeatModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRepeatModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>TEKRAR AYARLARI</Text>

            <View style={styles.repeatPickerRow}>
              <View style={styles.repeatUnitColumn}>
                {UNIT_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.repeatUnitButton, draftUnit === opt.value && styles.repeatUnitButtonActive]}
                    activeOpacity={0.75}
                    onPress={() => setDraftUnit(opt.value)}>
                    <Text
                      style={[
                        styles.repeatUnitLabel,
                        draftUnit === opt.value && styles.repeatUnitLabelActive,
                      ]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <WheelPicker
                data={NUMBER_OPTIONS}
                selectedIndex={draftIntervalIndex}
                onSelect={setDraftIntervalIndex}
              />
            </View>

            <Text style={styles.repeatPreview}>
              {formatRepeatSummary({ unit: draftUnit, interval: draftIntervalIndex + 1 })}
            </Text>

            <TouchableOpacity
              style={styles.confirmButton}
              activeOpacity={0.85}
              onPress={handleConfirmRepeat}>
              <Text style={styles.confirmButtonLabel}>ONAYLA</Text>
            </TouchableOpacity>

            {!!repeatConfig && (
              <TouchableOpacity style={styles.cancelHit} activeOpacity={0.7} onPress={handleClearRepeat}>
                <Text style={styles.cancelText}>Tekrarı Kaldır</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.cancelHit}
              activeOpacity={0.7}
              onPress={() => setRepeatModalVisible(false)}>
              <Text style={styles.cancelText}>Vazgeç</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#050505',
  },
  scrollContent: {
    flexGrow: 1,
    backgroundColor: '#050505',
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 32,
    gap: 28,
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
  form: {
    gap: 14,
  },
  input: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 10,
    color: '#F5F5F5',
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'web' ? 16 : 14,
  },
  textArea: {
    minHeight: 100,
    paddingTop: 14,
  },
  section: {
    gap: 10,
  },
  sectionLabel: {
    color: '#8A8A8A',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  rowItem: {
    flex: 1,
  },
  timingButton: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timingButtonActive: {
    borderColor: '#C1121F',
  },
  timingButtonLocked: {
    borderColor: '#7A1414',
    opacity: 0.7,
  },
  timingButtonLabel: {
    color: '#E4E4E4',
    fontSize: 15,
    fontWeight: '600',
  },
  warningText: {
    color: '#D98C2B',
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 17,
  },
  repeatButton: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#3A3A3A',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  repeatButtonLabel: {
    color: '#F5F5F5',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  repeatSummary: {
    color: '#8A8A8A',
    fontSize: 13,
    fontWeight: '500',
  },
  clearEndHit: {
    alignSelf: 'flex-start',
    paddingVertical: 2,
  },
  clearEndText: {
    color: '#8A8A8A',
    fontSize: 12,
    fontWeight: '600',
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 20,
    backgroundColor: '#050505',
    borderTopWidth: 1,
    borderTopColor: '#1A1A1A',
  },
  saveButton: {
    backgroundColor: '#C1121F',
    paddingVertical: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonLabel: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  modalBox: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#121212',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 14,
    padding: 24,
    gap: 16,
  },
  modalTitle: {
    color: '#F5F5F5',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.8,
    textAlign: 'center',
  },
  confirmButton: {
    backgroundColor: '#C1121F',
    paddingVertical: 16,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  cancelHit: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  cancelText: {
    color: '#8A8A8A',
    fontSize: 14,
    fontWeight: '600',
  },

  // --- Takvim ---
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  calendarNavButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarNavText: {
    color: '#F5F5F5',
    fontSize: 22,
    fontWeight: '700',
  },
  calendarNavTextDisabled: {
    color: '#3A3A3A',
  },
  calendarMonthLabel: {
    color: '#F5F5F5',
    fontSize: 16,
    fontWeight: '700',
  },
  calendarWeekRow: {
    flexDirection: 'row',
  },
  calendarWeekCell: {
    width: `${100 / 7}%`,
    alignItems: 'center',
    paddingBottom: 4,
  },
  calendarWeekText: {
    color: '#6B6B6B',
    fontSize: 12,
    fontWeight: '700',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  calendarCellSelected: {
    backgroundColor: '#C1121F',
  },
  calendarDayText: {
    color: '#E4E4E4',
    fontSize: 15,
    fontWeight: '500',
  },
  calendarDayTextDisabled: {
    color: '#333333',
  },
  calendarDayTextSelected: {
    color: '#FFFFFF',
    fontWeight: '800',
  },

  // --- Wheel picker (saat & sayı) ---
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
  warningTextCentered: {
    color: '#D98C2B',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },

  // --- Tekrar (birim + sayı) ---
  repeatPickerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  repeatUnitColumn: {
    height: WHEEL_CONTAINER_HEIGHT,
    justifyContent: 'space-between',
  },
  repeatUnitButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    backgroundColor: '#141414',
    alignItems: 'center',
    justifyContent: 'center',
  },
  repeatUnitButtonActive: {
    backgroundColor: '#C1121F',
    borderColor: '#C1121F',
  },
  repeatUnitLabel: {
    color: '#9A9A9A',
    fontSize: 14,
    fontWeight: '600',
  },
  repeatUnitLabelActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  repeatPreview: {
    color: '#E4E4E4',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});
