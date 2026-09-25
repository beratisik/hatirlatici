import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';

import { padDatePart, useUser } from '@/context/GoalContext';
import { CycleMark } from '@/components/cycle-mark';
import { WheelPicker } from '@/components/wheel-picker';
import { startOfToday } from '@/lib/schedule';
import {
  analyzeCycle,
  CYCLE_LENGTH_RANGE,
  DEFAULT_CYCLE_LENGTH,
  DEFAULT_PERIOD_LENGTH,
  formatCycleDate,
  loadCycleSettings,
  parseIsoDay,
  PERIOD_LENGTH_RANGE,
  saveCycleSettings,
  toIsoDay,
  type CycleSettings,
} from '@/lib/cycle';

const DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => padDatePart(i + 1));
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => padDatePart(i + 1));

function yearOptions(): string[] {
  const year = startOfToday().getFullYear();
  return [String(year - 2), String(year - 1), String(year)];
}

function clampDay(year: number, month: number, day: number): number {
  const last = new Date(year, month, 0).getDate();
  return Math.min(day, last);
}

function settingsFromParts(
  year: number,
  month: number,
  day: number,
  cycleLength: number,
  periodLength: number,
): CycleSettings {
  const safeDay = clampDay(year, month, day);
  return {
    lastPeriodDate: toIsoDay(new Date(year, month - 1, safeDay)),
    cycleLength,
    periodLength,
  };
}

function Stepper({
  label,
  value,
  min,
  max,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  onChange: (next: number) => void;
}) {
  return (
    <View style={styles.stepperBlock}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.stepperRow}>
        <TouchableOpacity
          style={styles.stepperHit}
          activeOpacity={0.8}
          onPress={() => onChange(Math.max(min, value - 1))}>
          <Text style={styles.stepperGlyph}>−</Text>
        </TouchableOpacity>
        <Text style={styles.stepperValue}>
          {value} {unit}
        </Text>
        <TouchableOpacity
          style={styles.stepperHit}
          activeOpacity={0.8}
          onPress={() => onChange(Math.min(max, value + 1))}>
          <Text style={styles.stepperGlyph}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function CycleTrackerScreen() {
  const router = useRouter();
  const { user } = useUser();
  const allowed = user?.gender === 'kadin';
  const years = useMemo(yearOptions, []);

  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<CycleSettings | null>(null);
  const [editing, setEditing] = useState(false);
  const [dateModal, setDateModal] = useState(false);
  const [cycleLength, setCycleLength] = useState(DEFAULT_CYCLE_LENGTH);
  const [periodLength, setPeriodLength] = useState(DEFAULT_PERIOD_LENGTH);
  const [dayIndex, setDayIndex] = useState(startOfToday().getDate() - 1);
  const [monthIndex, setMonthIndex] = useState(startOfToday().getMonth());
  const [yearIndex, setYearIndex] = useState(years.length - 1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await loadCycleSettings();
      if (cancelled) return;
      if (stored) {
        setSettings(stored);
        applyDraft(stored);
        setEditing(false);
      } else {
        setEditing(true);
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function applyDraft(next: CycleSettings) {
    const parsed = parseIsoDay(next.lastPeriodDate) ?? startOfToday();
    setCycleLength(next.cycleLength);
    setPeriodLength(next.periodLength);
    setDayIndex(Math.max(0, parsed.getDate() - 1));
    setMonthIndex(parsed.getMonth());
    const year = String(parsed.getFullYear());
    const found = years.indexOf(year);
    setYearIndex(found >= 0 ? found : years.length - 1);
  }

  const draftDate = useMemo(() => {
    const year = Number(years[yearIndex]);
    const month = monthIndex + 1;
    const day = clampDay(year, month, dayIndex + 1);
    return new Date(year, month - 1, day);
  }, [years, yearIndex, monthIndex, dayIndex]);

  const snapshot = settings ? analyzeCycle(settings) : null;

  function handleSave() {
    const next = settingsFromParts(
      Number(years[yearIndex]),
      monthIndex + 1,
      dayIndex + 1,
      cycleLength,
      periodLength,
    );
    setSettings(next);
    setEditing(false);
    void saveCycleSettings(next);
  }

  function handleCycleStarted() {
    Alert.alert('Döngün başladı', 'Bugün yeni döngünün ilk günü olarak kaydedilir.', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Kaydet',
        onPress: () => {
          const current = settings ?? {
            cycleLength: DEFAULT_CYCLE_LENGTH,
            periodLength: DEFAULT_PERIOD_LENGTH,
            lastPeriodDate: toIsoDay(startOfToday()),
          };
          const next: CycleSettings = {
            ...current,
            lastPeriodDate: toIsoDay(startOfToday()),
          };
          setSettings(next);
          applyDraft(next);
          void saveCycleSettings(next);
        },
      },
    ]);
  }

  if (!allowed) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <View style={styles.header}>
          <TouchableOpacity style={styles.backHit} activeOpacity={0.7} onPress={() => router.back()}>
            <Text style={styles.backText}>‹ Geri</Text>
          </TouchableOpacity>
          <Text style={styles.title}>DÖNGÜ TAKİBİ</Text>
          <Text style={styles.subtitle}>Bu ekran yalnızca kadın hesaplarda açık.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!ready) {
    return <SafeAreaView style={styles.safeArea} />;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity style={styles.backHit} activeOpacity={0.7} onPress={() => router.back()}>
            <Text style={styles.backText}>‹ Geri</Text>
          </TouchableOpacity>
          {settings && !editing ? (
            <TouchableOpacity
              style={styles.gear}
              activeOpacity={0.8}
              accessibilityLabel="Ayarlar"
              onPress={() => {
                applyDraft(settings);
                setEditing(true);
              }}>
              <Text style={styles.gearGlyph}>⚙</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <Text style={styles.title}>DÖNGÜ TAKİBİ</Text>
        <Text style={styles.subtitle}>
          {editing
            ? 'Son adet gününü ve ortalama süreleri gir. Tahmin buna göre kurulur.'
            : snapshot?.phaseLabel ?? 'Verin hazır. Sayaç çalışıyor.'}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {editing || !settings || !snapshot ? (
          <View style={styles.section}>
            <Text style={styles.label}>Son adet başlangıcı</Text>
            <TouchableOpacity
              style={styles.selectButton}
              activeOpacity={0.85}
              onPress={() => setDateModal(true)}>
              <Text style={styles.selectValue}>{formatCycleDate(draftDate)}</Text>
              <Text style={styles.selectHint}>İlk kanama günü</Text>
            </TouchableOpacity>

            <Stepper
              label="Ortalama döngü uzunluğu"
              value={cycleLength}
              min={CYCLE_LENGTH_RANGE.min}
              max={CYCLE_LENGTH_RANGE.max}
              unit="gün"
              onChange={setCycleLength}
            />
            <Stepper
              label="Kanama süresi"
              value={periodLength}
              min={PERIOD_LENGTH_RANGE.min}
              max={PERIOD_LENGTH_RANGE.max}
              unit="gün"
              onChange={setPeriodLength}
            />

            <TouchableOpacity style={styles.primary} activeOpacity={0.85} onPress={handleSave}>
              <Text style={styles.primaryLabel}>{settings ? 'KAYDET' : 'TAKİBİ BAŞLAT'}</Text>
            </TouchableOpacity>
            {settings ? (
              <TouchableOpacity style={styles.cancelHit} activeOpacity={0.7} onPress={() => setEditing(false)}>
                <Text style={styles.cancelText}>Vazgeç</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : (
          <View style={styles.section}>
            <View style={styles.hero}>
              <CycleMark size={52} color={snapshot.accent === 'red' ? '#C1121F' : '#3DDC84'} />
              <Text
                style={[
                  styles.heroValue,
                  snapshot.accent === 'red' ? styles.heroRed : styles.heroGreen,
                ]}>
                {snapshot.headlineValue}
              </Text>
              <Text
                style={[
                  styles.heroLabel,
                  snapshot.accent === 'red' ? styles.heroRed : styles.heroGreen,
                ]}>
                {snapshot.headlineLabel.toUpperCase()}
              </Text>
              <Text style={styles.heroPhase}>{snapshot.phaseLabel}</Text>
              <Text style={styles.heroDay}>Döngünün {snapshot.cycleDay}. günü</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardKey}>Sonraki beklenen tarih</Text>
              <Text style={styles.cardValue}>{formatCycleDate(snapshot.nextExpected)}</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardKey}>Son döngü tarihi</Text>
              <Text style={styles.cardValue}>{formatCycleDate(snapshot.lastPeriod)}</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardKey}>Döngü uzunluğu</Text>
              <Text style={styles.cardValue}>
                {settings.cycleLength} gün · kanama {settings.periodLength} gün
              </Text>
            </View>

            <TouchableOpacity style={styles.primary} activeOpacity={0.85} onPress={handleCycleStarted}>
              <Text style={styles.primaryLabel}>DÖNGÜM BAŞLADI</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <Modal
        visible={dateModal}
        transparent
        animationType="fade"
        onRequestClose={() => setDateModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>SON ADET GÜNÜ</Text>
            <View style={styles.wheelRow}>
              <WheelPicker data={DAY_OPTIONS} selectedIndex={dayIndex} onSelect={setDayIndex} />
              <WheelPicker data={MONTH_OPTIONS} selectedIndex={monthIndex} onSelect={setMonthIndex} />
              <WheelPicker data={years} selectedIndex={yearIndex} onSelect={setYearIndex} />
            </View>
            <TouchableOpacity
              style={styles.primary}
              activeOpacity={0.85}
              onPress={() => setDateModal(false)}>
              <Text style={styles.primaryLabel}>ONAYLA</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelHit} activeOpacity={0.7} onPress={() => setDateModal(false)}>
              <Text style={styles.cancelText}>Kapat</Text>
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
  header: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 8,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  gear: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gearGlyph: {
    color: '#E4E4E4',
    fontSize: 18,
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
    paddingTop: 8,
    paddingBottom: 40,
  },
  section: {
    gap: 14,
  },
  label: {
    color: '#8A8A8A',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
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
  selectValue: {
    color: '#F5F5F5',
    fontSize: 20,
    fontWeight: '800',
  },
  selectHint: {
    color: '#7A7A7A',
    fontSize: 12,
  },
  stepperBlock: {
    gap: 8,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#555555',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  stepperHit: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperGlyph: {
    color: '#F5F5F5',
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 26,
  },
  stepperValue: {
    color: '#F5F5F5',
    fontSize: 18,
    fontWeight: '800',
  },
  hero: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 16,
    paddingVertical: 28,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 8,
  },
  heroValue: {
    fontSize: 72,
    fontWeight: '900',
    lineHeight: 78,
  },
  heroLabel: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  heroGreen: {
    color: '#3DDC84',
  },
  heroRed: {
    color: '#C1121F',
  },
  heroPhase: {
    color: '#C8C8C8',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 10,
  },
  heroDay: {
    color: '#7A7A7A',
    fontSize: 13,
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 4,
  },
  cardKey: {
    color: '#8A8A8A',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  cardValue: {
    color: '#F2F2F2',
    fontSize: 16,
    fontWeight: '700',
  },
  primary: {
    marginTop: 8,
    backgroundColor: '#C1121F',
    borderRadius: 10,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
  },
  cancelHit: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  cancelText: {
    color: '#8A8A8A',
    fontSize: 14,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalBox: {
    backgroundColor: '#101010',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 16,
    padding: 18,
    gap: 14,
  },
  modalTitle: {
    color: '#F2F2F2',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  wheelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
});
